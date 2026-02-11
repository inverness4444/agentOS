"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getAgentPhotoByName } from "@/lib/data";
import { sidebarNavItems } from "@/lib/navigation/sidebarNav";

const iconByKey: Record<string, JSX.Element> = {
  tasks: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-6 5-6 2.5 6 3 6" />
    </svg>
  ),
  board: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M5 19h14" />
      <path d="M6 19V9h12v10" />
      <path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
      <path d="M10 13h4" />
    </svg>
  ),
  agents: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M7 7a5 5 0 0 1 10 0" />
      <path d="M5 11h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7Z" />
      <path d="M9 11v-2m6 2v-2" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M14 7l3 3-8 8H6v-3l8-8Z" />
      <path d="M16 5a3 3 0 0 0 3 3" />
    </svg>
  ),
  knowledge: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6Z" />
      <path d="M7 7h10M7 11h10M7 15h6" />
    </svg>
  ),
  billing: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3Z" />
      <path d="M9.5 12.5l1.8 1.8 3.2-3.6" />
    </svg>
  )
};

type AgentItem = {
  id: string;
  name: string;
};

type SidebarProps = {
  onHide?: () => void;
  onSubscriptionBlocked?: (message: string) => void;
};

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={cn("h-4 w-4 transition", open ? "rotate-180" : "")}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export default function Sidebar({ onHide, onSubscriptionBlocked }: SidebarProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const { data } = useSession();
  const email = data?.user?.email ?? "user@agentos";
  const isSuperAdmin = String(data?.user?.role || "").toUpperCase() === "SUPER_ADMIN";
  const sessionHasSubscription = String(data?.user?.plan || "").toUpperCase() === "PRO";
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [agentsOpen, setAgentsOpen] = useState(true);
  const [hasSubscription, setHasSubscription] = useState(sessionHasSubscription);
  const [subscriptionStatusLoaded, setSubscriptionStatusLoaded] = useState(false);
  const [subscriptionNotice, setSubscriptionNotice] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/agents");
        if (!response.ok) return;
        const data = await response.json();
        const list = (data.agents ?? []).map((agent: AgentItem) => ({
          id: agent.id,
          name: agent.name
        }));
        setAgents(list.slice(0, 6));
      } catch {
        setAgents([]);
      }
    };

    load();
  }, []);

  useEffect(() => {
    let active = true;
    const loadSubscriptionStatus = async () => {
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!active) return;
        setHasSubscription(Boolean(payload?.hasSubscription));
        setSubscriptionStatusLoaded(true);
      } catch {
        if (!active) return;
        setSubscriptionStatusLoaded(true);
      }
    };

    loadSubscriptionStatus();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSubscriptionNotice("");
  }, [currentPath]);

  const agentPreview = useMemo(() => agents, [agents]);
  const effectiveHasSubscription = subscriptionStatusLoaded
    ? hasSubscription
    : sessionHasSubscription;
  const shouldBlockNav = !effectiveHasSubscription;
  const ensureSubscriptionFor = (event: MouseEvent, href: string) => {
    const isBilling = href === "/billing" || href.startsWith("/billing/");
    if (!isBilling && shouldBlockNav) {
      event.preventDefault();
      const message = "Подписки нет. Оплатите подписку в разделе «Биллинг».";
      setSubscriptionNotice(message);
      onSubscriptionBlocked?.(message);
      return false;
    }
    setSubscriptionNotice("");
    return true;
  };

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-64 flex-col border-r border-slate-200/70 bg-[#F8F7FB] px-6 py-6 text-[#1F2238] lg:flex">
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/tasks" prefetch={false} className="flex items-center gap-3">
            <span className="text-xl font-semibold text-[#3E3A8C]">
              agentOS
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {onHide ? (
              <button
                type="button"
                onClick={onHide}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-[#5A6072]"
                aria-label="Скрыть сайдбар"
                title="Скрыть сайдбар"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
            ) : null}
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-[#EEF0FF] text-xs font-semibold text-[#3E3A8C]">
              {email.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
        <div className="mt-4 text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Workspace
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#1F2238]">
          agentOS
        </div>

        <nav className="mt-8 space-y-1 text-sm">
          {sidebarNavItems.filter((item) => item.hidden !== true).map((item) => {
            const active =
              currentPath === item.href || currentPath.startsWith(`${item.href}/`);
            return (
              <div key={item.href} className="space-y-1">
                <Link
                  href={item.href}
                  prefetch={false}
                  onClick={(event) => {
                    ensureSubscriptionFor(event, item.href);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-2 text-black transition",
                    active
                      ? "bg-[#EFEFF7] font-semibold"
                      : "hover:bg-[#F7F8FF]"
                  )}
                >
                  <span className={cn("text-black", active && "text-black")}>
                    {iconByKey[item.icon] || iconByKey.tasks}
                  </span>
                  <span className="whitespace-normal break-words text-base text-black">
                    {item.label}
                  </span>
                  {item.href === "/agents" && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        setAgentsOpen((prev) => !prev);
                      }}
                      className="ml-auto text-black"
                    >
                      <Chevron open={agentsOpen} />
                    </button>
                  )}
                </Link>
                {item.href === "/agents" && agentsOpen && agentPreview.length > 0 && (
                  <div className="ml-10 space-y-1 text-sm text-black">
                    {agentPreview.map((agent) => {
                      const photo = getAgentPhotoByName(agent.name);
                      return (
                        <Link
                          key={agent.id}
                          href={`/agents/${agent.id}`}
                          prefetch={false}
                          onClick={(event) => {
                            ensureSubscriptionFor(event, `/agents/${agent.id}`);
                          }}
                          className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition hover:bg-[#F7F8FF]"
                        >
                          {photo ? (
                            <img
                              src={photo}
                              alt={agent.name}
                              className="h-6 w-6 rounded-full border border-slate-200 object-cover"
                            />
                          ) : (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-[#3E3A8C]">
                              {agent.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="whitespace-normal break-words">
                            {agent.name}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {subscriptionNotice ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-black">
              {subscriptionNotice}
            </div>
          ) : null}
          {isSuperAdmin ? (
            <div className="space-y-1">
              <Link
                href="/admin/users"
                prefetch={false}
                onClick={(event) => {
                  ensureSubscriptionFor(event, "/admin/users");
                }}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2 text-black transition",
                  currentPath === "/admin" || currentPath.startsWith("/admin/")
                    ? "bg-[#EFEFF7] font-semibold"
                    : "hover:bg-[#F7F8FF]"
                )}
              >
                <span className="text-black">{iconByKey.admin}</span>
                <span className="whitespace-normal break-words text-base text-black">Супер-админ</span>
              </Link>
            </div>
          ) : null}
        </nav>
      </div>

      <div className="mt-5 space-y-3 border-t border-slate-200/70 pt-4">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-black"
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}
