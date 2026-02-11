import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Section from "@/components/Section";
import LogoutButton from "@/components/LogoutButton";
import AdvancedModeToggle from "@/components/account/AdvancedModeToggle";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { privateRobots } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  robots: privateRobots
};

export default async function AccountPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!process.env.DATABASE_URL) {
    return (
      <Section className="pt-24">
        <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/70 bg-white px-6 py-8 shadow-soft sm:px-10">
          <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
            Аккаунт
          </div>
          <h1 className="mt-3 text-3xl font-semibold text-[#1F2238]">
            База данных не настроена
          </h1>
          <p className="mt-3 text-sm text-[#5A6072] sm:text-base">
            Добавьте DATABASE_URL в .env и выполните миграции Prisma, чтобы
            открыть профиль.
          </p>
        </div>
      </Section>
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id }
  });

  if (!user) {
    redirect("/login");
  }

  const planLabel = user.plan === "PRO" ? "Pro" : "Free";

  return (
    <Section className="pt-24">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/70 bg-white px-6 py-8 shadow-soft sm:px-10">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Аккаунт
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2238]">
          Профиль пользователя
        </h1>
        <p className="mt-3 text-sm text-[#5A6072] sm:text-base">
          Данные аккаунта и текущий план подписки.
        </p>

        <div className="mt-6 grid gap-4 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-5 py-4 text-sm text-[#1F2238] sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              Email
            </div>
            <div className="mt-1 font-semibold">{user.email}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              Роль
            </div>
            <div className="mt-1 font-semibold">{user.role}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              План
            </div>
            <div className="mt-1 font-semibold">{planLabel}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              Дата регистрации
            </div>
            <div className="mt-1 font-semibold">
              {user.createdAt.toLocaleDateString("ru-RU")}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-3 rounded-full border border-[#D8DDF7] bg-white px-5 py-2 text-sm font-semibold text-[#3E3A8C] transition hover:-translate-y-0.5"
          >
            Назад в Dashboard
          </a>
          <LogoutButton className="inline-flex items-center gap-3 rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6]" />
        </div>

        <AdvancedModeToggle enabled={Boolean(user.advancedMode)} />
      </div>
    </Section>
  );
}
