"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import TableToolbar from "@/components/app/TableToolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/StateBlocks";
import { getAgentById } from "@/lib/tasks/catalog";

type TaskItem = {
  id: string;
  title: string;
  inputText: string;
  status: string;
  updatedAt: string;
  durationMs?: number | null;
  agents: string[];
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

const formatDuration = (value?: number | null) => {
  if (!value || value <= 0) return "—";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} мин`;
};

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "To Review">("All");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<"updated" | "status">("updated");
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2400);
  };

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks");
      if (!response.ok) {
        throw new Error("Не удалось загрузить задачи.");
      }
      const data = await response.json();
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError("Не удалось загрузить задачи.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return tasks.filter((task) => {
      const matchesFilter =
        filter === "All" ? true : task.status !== "success";
      const matchesSearch =
        task.title.toLowerCase().includes(query) ||
        task.inputText.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [tasks, search, filter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortKey === "status") {
      list.sort((a, b) => a.status.localeCompare(b.status));
      return list;
    }
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleRun = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка запуска");
      }
      showToast("success", "Запуск начат");
      router.push(`/tasks/${taskId}`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Ошибка запуска");
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm("Удалить задачу?")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    fetchTasks();
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
        title="Давайте автоматизируем процессы с помощью агентов."
        subtitle="Создавайте задачи, запускайте агентов и отслеживайте прогресс выполнения."
        action={
          <button
            type="button"
            onClick={() => router.push("/tasks/new")}
            className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
          >
            + Новая задача
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "To Review", label: "To Review" },
          { id: "All", label: "All" }
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setFilter(item.id as "All" | "To Review");
              setPage(1);
            }}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] ${
              filter === item.id
                ? "border-[#5C5BD6] bg-[#5C5BD6] text-white"
                : "border-[#D8DDF7] bg-white text-[#3E3A8C]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <TableToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Поиск по задачам"
        columnsLabel="Столбцы: (5)"
        sortLabel={sortKey === "updated" ? "Сортировка: Последнее изменение" : "Сортировка: Статус"}
        onSort={() => setSortKey((prev) => (prev === "updated" ? "status" : "updated"))}
      />

      <div className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : paged.length === 0 ? (
          filter === "To Review" && tasks.length > 0 ? (
            <EmptyState
              title="В To Review задач нет"
              description="Все задачи завершены. Переключитесь на вкладку All, чтобы увидеть историю."
            />
          ) : (
            <EmptyState
              title="Задач пока нет"
              description="Создайте первую задачу, чтобы запустить агента или команду."
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[#1F2238]">
              <thead className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                <tr>
                  <th className="py-3 pr-4">Название</th>
                  <th className="py-3 pr-4">Статус</th>
                  <th className="py-3 pr-4">Последнее изменение</th>
                  <th className="py-3 pr-4">Длительность</th>
                  <th className="py-3 pr-4">Агенты</th>
                  <th className="py-3 pr-2 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((task) => (
                  <tr
                    key={task.id}
                    className="border-t border-slate-100 hover:bg-[#F8F9FF]"
                  >
                    <td className="py-4 pr-4">
                      <div className="font-semibold whitespace-normal break-words">
                        {task.title}
                      </div>
                      <div className="mt-1 text-xs text-[#5A6072] whitespace-normal break-words">
                        {task.inputText}
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold">
                        {task.status}
                      </span>
                    </td>
                    <td className="py-4 pr-4">
                      {formatRelativeTime(task.updatedAt)}
                    </td>
                    <td className="py-4 pr-4">{formatDuration(task.durationMs)}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-2">
                        {task.agents.slice(0, 4).map((agentId) => {
                          const agent = getAgentById(agentId);
                          const label = agent?.name || agentId;
                          return (
                            <span
                              key={agentId}
                              title={label}
                              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-[#3E3A8C]"
                            >
                              {label.slice(0, 1).toUpperCase()}
                            </span>
                          );
                        })}
                        {task.agents.length === 0 && <span className="text-xs text-[#5A6072]">—</span>}
                      </div>
                    </td>
                    <td className="py-4 pr-2 text-right text-xs font-semibold text-[#4E4FE0]">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => router.push(`/tasks/${task.id}`)}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
                        >
                          Открыть
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRun(task.id)}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1"
                        >
                          Запустить снова
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(task.id)}
                          className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-red-500"
                        >
                          Удалить
                        </button>
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
