import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import allowlist from "@/lib/admin/allowlist.js";

const { isAllowlistedSuperAdminEmail } = allowlist as {
  isAllowlistedSuperAdminEmail: (email: string) => boolean;
};

export async function getUserId() {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id ?? null;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, status: true, role: true }
  });
  if (user) {
    if (String(user.status || "").toUpperCase() === "BLOCKED") {
      return null;
    }
    const email = String(user.email || "").toLowerCase();
    if (email && isAllowlistedSuperAdminEmail(email) && user.role !== "SUPER_ADMIN") {
      await prisma.user.update({
        where: { id },
        data: { role: "SUPER_ADMIN", status: "ACTIVE" }
      });
    }
    return id;
  }

  if (process.env.NODE_ENV === "development") {
    const baseEmail = session?.user?.email ?? `dev-${id}@local`;
    const passwordHash = await hashPassword(`dev-password-${id.slice(0, 8)}`);
    const isAllowlisted = isAllowlistedSuperAdminEmail(baseEmail);
    try {
        await prisma.user.create({
          data: {
            id,
            email: baseEmail,
            passwordHash,
            role: isAllowlisted ? "SUPER_ADMIN" : session?.user?.role ?? "USER",
            status: "ACTIVE",
            plan: session?.user?.plan ?? "FREE",
            advancedMode: false
          }
        });
      return id;
    } catch (error) {
      if (baseEmail !== `dev-${id}@local`) {
        try {
            await prisma.user.create({
              data: {
                id,
                email: `dev-${id}@local`,
                passwordHash,
                role: session?.user?.role ?? "USER",
                status: "ACTIVE",
                plan: session?.user?.plan ?? "FREE",
                advancedMode: false
              }
            });
          return id;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  return null;
}
