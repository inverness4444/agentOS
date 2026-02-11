"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import TableToolbar from "@/components/app/TableToolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/StateBlocks";
import NftAvatar from "@/components/NftAvatar";
import { departments, getAgentPhotoByName } from "@/lib/data";

type Agent = {
  id: string;
  name: string;
  description: string;
  toolIds: string;
  updatedAt: string;
  published: boolean;
};

const pageSize = 25;

const normalizeAgentName = (name: string) => {
  const source = String(name || "");
  const base = source.split("—")[0]?.split("-")[0] ?? source;
  return base.trim().toLowerCase().replace(/ё/g, "е");
};

const categoryByAgentName = (() => {
  const map = new Map<string, "sales" | "marketing">();

  const salesDepartment = departments.find((item) => item.id === "sales");
  const contentDepartment = departments.find((item) => item.id === "content");

  const salesAgents = salesDepartment
    ? [...salesDepartment.featured, ...salesDepartment.included]
    : [];
  const marketingAgents = contentDepartment
    ? [...contentDepartment.featured, ...contentDepartment.included]
    : [];

  for (const agent of salesAgents) {
    map.set(normalizeAgentName(agent.name), "sales");
  }
  for (const agent of marketingAgents) {
    map.set(normalizeAgentName(agent.name), "marketing");
  }

  return map;
})();

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchAgents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agents");
      if (!response.ok) {
        throw new Error("Не удалось загрузить агентов.");
      }
      const data = await response.json();
      setAgents(data.agents ?? []);
    } catch (err) {
      setError("Не удалось загрузить агентов.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return agents.filter((agent) => {
      return (
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query)
      );
    });
  }, [agents, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const grouped = useMemo(() => {
    const buckets: Record<"sales" | "marketing" | "other", Agent[]> = {
      sales: [],
      marketing: [],
      other: []
    };

    for (const agent of paged) {
      const category = categoryByAgentName.get(normalizeAgentName(agent.name));
      if (category === "sales") {
        buckets.sales.push(agent);
      } else if (category === "marketing") {
        buckets.marketing.push(agent);
      } else {
        buckets.other.push(agent);
      }
    }

    return buckets;
  }, [paged]);

  const handleCreate = async () => {
    const response = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Новый агент" })
    });
    if (response.ok) {
      fetchAgents();
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Давайте автоматизируем процессы с помощью агентов."
        subtitle="Создавайте и запускайте агентов, настраивайте их инструкции и инструменты."
        tabs={["По умолчанию", "Команды", "Черновики"]}
        action={
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
          >
            + Новый агент
          </button>
        }
      />

      <TableToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Поиск по агентам"
        columnsLabel="Столбцы: (3)"
        sortLabel="Сортировка: Последнее изменение"
      />

      <div className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : paged.length === 0 ? (
          <EmptyState
            title="Агентов пока нет"
            description="Создайте нового агента и настройте инструкции."
          />
        ) : (
          <div className="space-y-8">
            {[
              { key: "sales" as const, title: "Продажи", items: grouped.sales },
              { key: "marketing" as const, title: "Маркетинг", items: grouped.marketing }
            ].map((section) =>
              section.items.length > 0 ? (
                <section key={section.key} className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#3E3A8C]">
                    {section.title}
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {section.items.map((agent) => {
                      let tools: string[] = [];
                      try {
                        tools = JSON.parse(agent.toolIds || "[]") as string[];
                      } catch {
                        tools = [];
                      }
                      const photo = getAgentPhotoByName(agent.name);
                      return (
                        <div
                          key={agent.id}
                          onClick={() => router.push(`/agents/${agent.id}`)}
                          className="group cursor-pointer rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-soft"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex items-center gap-3">
                              {photo ? (
                                <NftAvatar
                                  seed={agent.id}
                                  size={44}
                                  photo={photo}
                                  alt={agent.name}
                                  className="rounded-2xl"
                                />
                              ) : (
                                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-sm font-semibold text-[#3E3A8C]">
                                  {agent.name.slice(0, 1).toUpperCase()}
                                </span>
                              )}
                              <div>
                                <div className="text-sm font-semibold text-[#1F2238] whitespace-normal break-words">
                                  {agent.name}
                                </div>
                                <div className="mt-1 text-xs text-[#5A6072] whitespace-normal break-words">
                                  {agent.description}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {tools.length === 0 ? (
                              <span className="text-xs text-[#5A6072]">
                                Инструменты не подключены
                              </span>
                            ) : (
                              tools.map((tool) => (
                                <span
                                  key={tool}
                                  className="rounded-full border border-slate-200 bg-[#EEF0FF] px-3 py-1 text-[11px] font-semibold text-[#3E3A8C]"
                                >
                                  {tool}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null
            )}

            {grouped.other.length > 0 ? (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[#3E3A8C]">
                  Прочее
                </h3>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {grouped.other.map((agent) => {
                    let tools: string[] = [];
                    try {
                      tools = JSON.parse(agent.toolIds || "[]") as string[];
                    } catch {
                      tools = [];
                    }
                    const photo = getAgentPhotoByName(agent.name);
                    return (
                      <div
                        key={agent.id}
                        onClick={() => router.push(`/agents/${agent.id}`)}
                        className="group cursor-pointer rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-soft"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex items-center gap-3">
                            {photo ? (
                              <NftAvatar
                                seed={agent.id}
                                size={44}
                                photo={photo}
                                alt={agent.name}
                                className="rounded-2xl"
                              />
                            ) : (
                              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-sm font-semibold text-[#3E3A8C]">
                                {agent.name.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <div>
                              <div className="text-sm font-semibold text-[#1F2238] whitespace-normal break-words">
                                {agent.name}
                              </div>
                              <div className="mt-1 text-xs text-[#5A6072] whitespace-normal break-words">
                                {agent.description}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {tools.length === 0 ? (
                            <span className="text-xs text-[#5A6072]">
                              Инструменты не подключены
                            </span>
                          ) : (
                            tools.map((tool) => (
                              <span
                                key={tool}
                                className="rounded-full border border-slate-200 bg-[#EEF0FF] px-3 py-1 text-[11px] font-semibold text-[#3E3A8C]"
                              >
                                {tool}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#5A6072]">
          <div>
            Показано {paged.length} из {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]">
              25
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
            >
              ←
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
