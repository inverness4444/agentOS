"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import TableToolbar from "@/components/app/TableToolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/StateBlocks";

type WorkforceWorkflow = {
  id: string;
  name: string;
  description: string;
  category: string;
  status: string;
  isActive: boolean;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  updatedAt: string;
};

const pageSize = 25;

const formatRelativeTime = (value?: string | null) => {
  if (!value) return "—";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
};

const statusLabel = (workflow: WorkforceWorkflow) => {
  if (!workflow.isActive) return "Inactive";
  if (workflow.status === "published") return "Published";
  return "Draft";
};

export default function WorkforcePage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkforceWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"default" | "team" | "draft">("default");
  const [sortKey, setSortKey] = useState<"updated" | "lastRun">("updated");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2400);
  };

  const fetchWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workforce/workflows?category=${activeTab}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить workflows.");
      }
      const data = await response.json();
      setWorkflows(data.workflows ?? []);
      setAdvancedMode(Boolean(data.viewer?.advancedMode));
    } catch (err) {
      setError("Не удалось загрузить workflows.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, [activeTab]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return workflows.filter((workflow) =>
      [workflow.name, workflow.description].some((field) => field.toLowerCase().includes(query))
    );
  }, [workflows, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortKey === "lastRun") {
      list.sort((a, b) => {
        const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
        const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
        return bTime - aTime;
      });
      return list;
    }
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleCreate = async () => {
    if (!advancedMode) {
      showToast("error", "Advanced Mode нужен для создания workflow");
      return;
    }
    const response = await fetch("/api/workforce/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Новый workflow", category: activeTab })
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.workflow?.id) {
        router.push(`/workforce/${data.workflow.id}/build`);
        return;
      }
      fetchWorkflows();
    } else {
      showToast("error", "Не удалось создать workflow");
    }
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-soft">
          <span className={toast.type === "success" ? "text-emerald-600" : "text-red-600"}>
            {toast.message}
          </span>
        </div>
      )}

      <PageHero
        title="Рабочая сила"
        subtitle="Запускайте готовые workflow и управляйте автоматизацией команды."
        action={
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
          >
            + Новый workflow
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-full border border-[#D8DDF7] bg-white px-3 py-2 text-xs font-semibold text-[#3E3A8C]">
        {[
          { id: "default", label: "По умолчанию" },
          { id: "team", label: "Команда" },
          { id: "draft", label: "Черновики" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id as any);
              setPage(1);
            }}
            className={`rounded-full px-4 py-1 ${
              activeTab === tab.id ? "bg-[#5C5BD6] text-white" : "text-[#3E3A8C]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TableToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Поиск по workflow"
        columnsLabel="Столбцы: (5)"
        sortLabel={sortKey === "updated" ? "Сортировка: Последнее изменение" : "Сортировка: Последний запуск"}
        onSort={() => setSortKey((prev) => (prev === "updated" ? "lastRun" : "updated"))}
      />

      <div className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : paged.length === 0 ? (
          <EmptyState
            title="Workflow пока нет"
            description="Создайте первый workflow и соберите цепочку шагов."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#1F2238]">
              <thead className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                <tr>
                  <th className="py-3 pr-4">Название</th>
                  <th className="py-3 pr-4">Категория</th>
                  <th className="py-3 pr-4">Последний запуск</th>
                  <th className="py-3 pr-4">Статус</th>
                  <th className="py-3 pr-2 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((workflow) => (
                  <tr
                    key={workflow.id}
                    className="border-t border-slate-100 hover:bg-[#F8F9FF]"
                  >
                    <td className="py-4 pr-4">
                      <div className="font-semibold whitespace-normal break-words">
                        {workflow.name}
                      </div>
                      <div className="text-xs text-[#5A6072] whitespace-normal break-words">
                        {workflow.description}
                      </div>
                    </td>
                    <td className="py-4 pr-4 capitalize">{workflow.category}</td>
                    <td className="py-4 pr-4">
                      <div className="text-sm font-medium">{formatRelativeTime(workflow.lastRunAt)}</div>
                      {workflow.lastRunStatus && (
                        <div
                          className={`mt-1 text-xs ${
                            workflow.lastRunStatus === "success" ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {workflow.lastRunStatus}
                        </div>
                      )}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold">
                        {statusLabel(workflow)}
                      </span>
                    </td>
                    <td className="py-4 pr-2 text-right text-xs font-semibold text-[#4E4FE0]">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/workforce/${workflow.id}`)}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
                        >
                          Запустить
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/workforce/${workflow.id}#runs`)}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
                        >
                          Логи
                        </button>
                        {advancedMode && (
                          <button
                            type="button"
                            onClick={() => router.push(`/workforce/${workflow.id}/build`)}
                            className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
                          >
                            Редактировать
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
