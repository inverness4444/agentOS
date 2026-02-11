"use client";

import { useState, useEffect, type FormEvent } from "react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Section from "@/components/Section";

export default function LoginPageClient() {
  const { status } = useSession();
  const router = useRouter();
  const callbackUrl = "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false
    });

    setLoading(false);
    if (result?.error) {
      setError("Неверный email или пароль.");
      return;
    }
    router.push(callbackUrl);
  };

  return (
    <Section className="pt-24">
      <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200/70 bg-white px-6 py-8 shadow-soft sm:px-10">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Вход в аккаунт
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2238]">
          Получить ссылку для входа
        </h1>
        <p
          className="mt-3 text-sm !text-[#111827] sm:text-base"
          style={{ color: "#111827", opacity: 1 }}
        >
          Войдите с помощью email и пароля. Аккаунт создаётся бесплатно.
        </p>

        <form onSubmit={onLogin} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-[#1F2238]">Email</span>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238] outline-none transition focus:border-[#5C5BD6] focus:ring-2 focus:ring-[#5C5BD6]/20"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-[#1F2238]">Пароль</span>
            <input
              type="password"
              required
              placeholder="Минимум 6 символов"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238] outline-none transition focus:border-[#5C5BD6] focus:ring-2 focus:ring-[#5C5BD6]/20"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600">
              {error} Если забыли пароль, откройте регистрацию и задайте новый.
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#5C5BD6] px-6 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Входим..." : "Войти"}
          </button>
        </form>

        <div className="mt-4 text-sm text-[#5A6072]">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-semibold text-[#4E4FE0]" data-analytics-event="signup_click" data-analytics-label="login_page_signup_link">
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </Section>
  );
}
