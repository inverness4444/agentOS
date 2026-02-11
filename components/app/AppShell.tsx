"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/app/Sidebar";
import { cn } from "@/lib/utils";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeHidesSidebar = pathname?.startsWith("/agents/") ?? false;
  const isBoardPage = pathname?.startsWith("/board") ?? false;
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [showSubscriptionOverlay, setShowSubscriptionOverlay] = useState(false);
  const [subscriptionOverlayText, setSubscriptionOverlayText] = useState(
    "Подписка неактивна. Оплатите доступ в разделе «Биллинг»."
  );

  useEffect(() => {
    const stored = window.localStorage.getItem("agentos_sidebar_hidden");
    setSidebarHidden(stored === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("agentos_sidebar_hidden", sidebarHidden ? "1" : "0");
  }, [sidebarHidden]);

  useEffect(() => {
    setShowSubscriptionOverlay(false);
  }, [pathname]);

  const showSidebar = !routeHidesSidebar && !sidebarHidden;

  return (
    <div className="min-h-screen bg-[#F6F7FF]">
      {showSidebar && (
        <Sidebar
          onHide={() => setSidebarHidden(true)}
          onSubscriptionBlocked={(message) => {
            setSubscriptionOverlayText(message);
            setShowSubscriptionOverlay(true);
          }}
        />
      )}
      {!routeHidesSidebar && sidebarHidden ? (
        <button
          type="button"
          onClick={() => setSidebarHidden(false)}
          className="fixed left-4 top-4 z-40 hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-2 text-xs font-semibold text-[#3E3A8C] shadow-sm lg:inline-flex"
          aria-label="Показать сайдбар"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 6l6 6-6 6" />
          </svg>
          Меню
        </button>
      ) : null}
      <div
        className={cn(
          "min-h-screen transition",
          showSubscriptionOverlay && "blur-[2px] pointer-events-none select-none",
          isBoardPage ? "px-2 py-2 lg:px-4 lg:py-4" : "px-6 py-6 lg:px-10",
          showSidebar ? "lg:ml-64" : isBoardPage ? "lg:px-4" : "lg:px-12"
        )}
      >
        {children}
      </div>
      {showSubscriptionOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/25 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-xl font-semibold text-[#1F2238]">Нужна подписка</h3>
            <p className="mt-3 text-sm text-[#374151]">{subscriptionOverlayText}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/billing"
                className="inline-flex items-center rounded-full bg-[#5C5BD6] px-5 py-2.5 text-sm font-semibold text-white"
                onClick={() => setShowSubscriptionOverlay(false)}
              >
                Перейти в биллинг
              </Link>
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-[#1F2238]"
                onClick={() => setShowSubscriptionOverlay(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
