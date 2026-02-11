"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type PageHeroProps = {
  title: string;
  subtitle?: string;
  tabs?: string[];
  action?: ReactNode;
  className?: string;
};

export default function PageHero({
  title,
  subtitle,
  tabs,
  action,
  className
}: PageHeroProps) {
  const pathname = usePathname();
  const showOnlyOnKnowledge = pathname?.startsWith("/knowledge");

  if (!showOnlyOnKnowledge) {
    return null;
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200/70 bg-[#F4F6FF] px-6 py-6 shadow-sm",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-[#5C5BD6]/25 via-[#7B7BFF]/20 to-transparent blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-gradient-to-br from-[#B1B3FF]/40 via-[#E6E8FF]/40 to-transparent blur-3xl" />
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(92,91,214,0.15)_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold text-[#1F2238] sm:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm text-[#5A6072] sm:text-base whitespace-normal break-words">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {tabs && tabs.length > 0 && (
        <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-full border border-[#D8DDF7] bg-white/80 px-2 py-1 text-xs font-semibold text-[#3E3A8C] backdrop-blur">
          {tabs.map((tab, index) => (
            <span
              key={tab}
              className={cn(
                "rounded-full px-3 py-1 transition",
                index === 0 ? "bg-[#5C5BD6] text-white" : "text-[#3E3A8C]"
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
