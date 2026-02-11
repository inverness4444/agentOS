"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function ScrollCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 160);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-2xl rounded-full border border-[#D8DDF7] bg-[#EEF0FF]/95 px-5 py-2.5 shadow-soft backdrop-blur transition-all",
          visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-[#8AA0FF]" />
            <span className="text-[13px] font-semibold text-[#3E3A8C]">
              Доступ к системе
            </span>
            <span className="text-[11px] text-[#3E3A8C]/60">|</span>
            <span className="text-[13px] font-semibold text-[#3E3A8C] line-through opacity-70">
              10 000 ₽
            </span>
            <span className="rounded-full border border-[#C7CBFF] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4E4FE0]">
              СКИДКА 50%
            </span>
          </div>
          <Link
            href="/register"
            data-analytics-event="cta_access_scroll"
            data-analytics-label="scroll_get_access"
            className="inline-flex items-center gap-2 rounded-full bg-[#5C5BD6] px-5 py-2 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6]"
          >
            Получить доступ
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
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
        </div>
      </div>
    </div>
  );
}
