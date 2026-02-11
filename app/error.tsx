"use client";

import { useEffect } from "react";
import Link from "next/link";
import Container from "@/components/Container";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app_error", error);
  }, [error]);

  return (
    <main className="min-h-screen py-24">
      <Container>
        <div className="mx-auto max-w-2xl rounded-3xl border border-slate-200/70 bg-white px-8 py-10 shadow-soft">
          <p className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
            500
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[#1F2238]">
            Что-то пошло не так
          </h1>
          <p className="mt-3 text-sm text-[#5A6072]">
            Попробуйте обновить страницу. Если ошибка повторяется, откройте главную и повторите действие.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center rounded-full bg-[#5C5BD6] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Повторить
            </button>
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#1F2238]"
            >
              На главную
            </Link>
          </div>
        </div>
      </Container>
    </main>
  );
}
