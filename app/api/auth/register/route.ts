import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import allowlist from "@/lib/admin/allowlist.js";
import requestSecurity from "@/lib/security/request.js";

const { isAllowlistedSuperAdminEmail } = allowlist as {
  isAllowlistedSuperAdminEmail: (email: string) => boolean;
};
const { isSameOriginRequest } = requestSecurity as {
  isSameOriginRequest: (request: Request) => boolean;
};

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(10, "Пароль должен быть не короче 10 символов.")
    .regex(/[a-z]/, "Пароль должен содержать строчную букву.")
    .regex(/[A-Z]/, "Пароль должен содержать заглавную букву.")
    .regex(/[0-9]/, "Пароль должен содержать цифру.")
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL не настроен. Заполните .env и перезапустите сервер." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse({
      email: String(body.email ?? "").toLowerCase().trim(),
      password: String(body.password ?? "")
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message || "Проверьте корректность email и пароля.";
      return NextResponse.json({ error: first }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    const passwordHash = await hashPassword(password);

    if (existing) {
      if (process.env.NODE_ENV !== "production") {
        const allowlisted = isAllowlistedSuperAdminEmail(email);
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            role: allowlisted ? "SUPER_ADMIN" : existing.role,
            status: "ACTIVE"
          }
        });
        return NextResponse.json({ ok: true, passwordReset: true });
      }

      return NextResponse.json(
        { error: "Пользователь с таким email уже существует." },
        { status: 409 }
      );
    }

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: isAllowlistedSuperAdminEmail(email) ? "SUPER_ADMIN" : "USER",
        status: "ACTIVE"
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[register]", error);
    return NextResponse.json(
      { error: "Ошибка сервера при регистрации. Проверьте логи." },
      { status: 500 }
    );
  }
}
