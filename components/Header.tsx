"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Container from "./Container";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "next-auth/react";

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { status } = useSession();
  const isAuthed = status === "authenticated";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all",
        isScrolled ? "py-3" : "border-b border-slate-200/70 bg-base/80 backdrop-blur"
      )}
    >
      <Container className={cn(isScrolled ? "py-0" : "py-3")}>
        <div
          className={cn(
            "flex items-center justify-between gap-4 transition-all",
            isScrolled
              ? "rounded-full border border-[#D8DDF7] bg-[#EEF0FF]/90 px-6 py-3 shadow-soft backdrop-blur"
              : "px-0"
          )}
        >
          <Link href="/" className="flex items-center">
            <span className="font-heading text-2xl font-semibold text-[#3E3A8C]">
              agentOS
            </span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-8 text-sm font-semibold text-[#3E3A8C] lg:flex">
            <a href="#board" className="transition hover:text-[#2B2C4B]">
              Совет директоров
            </a>
            <a href="#sales" className="transition hover:text-[#2B2C4B]">
              Продажи
            </a>
            <a href="#content" className="transition hover:text-[#2B2C4B]">
              Маркетинг
            </a>
            <a href="#pricing" className="transition hover:text-[#2B2C4B]">
              Тарифы
            </a>
          </nav>
          <div className="flex items-center gap-3">
            {isAuthed ? (
              <>
                <Link
                  href="/dashboard"
                  data-analytics-event="cta_dashboard_header"
                  data-analytics-label="header_dashboard"
                  className="inline-flex items-center gap-3 rounded-full bg-[#5C5BD6] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6]"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="inline-flex items-center rounded-full border border-[#D8DDF7] bg-white px-5 py-2 text-sm font-semibold text-[#3E3A8C] transition hover:-translate-y-0.5"
                >
                  Выйти
                </button>
              </>
            ) : (
              <Link
                href="/register"
                data-analytics-event="cta_access_header"
                data-analytics-label="header_get_access"
                className="inline-flex items-center gap-3 rounded-full bg-[#5C5BD6] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6]"
              >
                Получить доступ
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m13 5 6 7-6 7" />
                </svg>
              </Link>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
