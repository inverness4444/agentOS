"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { ErrorState } from "@/components/app/StateBlocks";
import { getAgentById } from "@/lib/tasks/catalog";

const POLLING_INTERVAL_MS = 1500;

const parseJsonSafe = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

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

const formatDurationCompact = (value?: number | null) => {
  if (!value || value <= 0) return "—";
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds}с`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}м ${seconds}с`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}ч ${restMinutes}м`;
};

const formatRunTime = (value?: string | null) => {
  if (!value) return "без времени";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "без времени";

  const now = new Date();
  const dateDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowDayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDiff = Math.round((nowDayStart - dateDayStart) / 86400000);

  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (dayDiff === 0) return `сегодня ${time}`;
  if (dayDiff === 1) return `вчера ${time}`;
  return `${date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} ${time}`;
};

const statusBadgeClass = (status?: string | null) => {
  if (status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "error") return "border-red-200 bg-red-50 text-red-600";
  if (status === "running") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "queued") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-[#D8DDF7] bg-white text-[#1F2238]";
};

type TaskStep = {
  id: string;
  order: number;
  attempt?: number | null;
  kind: string;
  agentId?: string | null;
  toolSlug?: string | null;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  inputJson?: string | null;
  outputJson?: string | null;
  errorText?: string | null;
  meta?: string | null;
};

type TaskMessage = {
  id: string;
  role: string;
  agentId?: string | null;
  content: string;
  createdAt: string;
  meta?: string | null;
};

type TaskRun = {
  runIndex: number;
  status: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  stepsCount: number;
  errorsCount: number;
};

type Task = {
  id: string;
  title?: string | null;
  inputText: string;
  status: string;
  mode: string;
  currentRunIndex: number;
  selectedRunIndex: number;
  updatedAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  errorText?: string | null;
  outputSummary?: string | null;
};

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params?.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [selectedRunIndex, setSelectedRunIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const fetchRuns = useCallback(async () => {
    if (!taskId) return [] as TaskRun[];

    const response = await fetch(`/api/tasks/${taskId}/runs`);
    if (!response.ok) {
      throw new Error("Не удалось загрузить запуски.");
    }

    const data = await response.json();
    const nextRuns = Array.isArray(data.runs)
      ? [...data.runs].sort((a, b) => b.runIndex - a.runIndex)
      : [];
    setRuns(nextRuns);
    return nextRuns as TaskRun[];
  }, [taskId]);

  const fetchTask = useCallback(
    async (runIndex?: number | null) => {
      if (!taskId) return null;
      const query = typeof runIndex === "number" ? `?runIndex=${runIndex}` : "";
      const response = await fetch(`/api/tasks/${taskId}${query}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить задачу.");
      }
      const data = await response.json();
      setTask(data.task);
      setSteps(data.steps ?? []);
      setMessages(data.messages ?? []);
      setSelectedStep(null);
      setError(null);
      return data.task as Task;
    },
    [taskId]
  );

  useEffect(() => {
    if (!taskId) return;

    let active = true;

    const bootstrap = async () => {
      setLoading(true);
      setError(null);
      try {
        const runItems = await fetchRuns();
        const initialRunIndex = runItems.length > 0 ? runItems[0].runIndex : null;
        if (!active) return;

        setSelectedRunIndex(initialRunIndex);
        await fetchTask(initialRunIndex);
      } catch {
        if (!active) return;
        setError("Не удалось загрузить задачу.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, [taskId, fetchRuns, fetchTask]);

  const selectedRun = useMemo(
    () => runs.find((run) => run.runIndex === selectedRunIndex) ?? null,
    [runs, selectedRunIndex]
  );

  useEffect(() => {
    if (!selectedRun || !["running", "queued"].includes(selectedRun.status)) return;

    const interval = setInterval(() => {
      fetchTask(selectedRun.runIndex).catch(() => null);
      fetchRuns().catch(() => null);
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [selectedRun, fetchTask, fetchRuns]);

  const handleRun = async () => {
    if (!taskId) return;

    try {
      const response = await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Не удалось запустить задачу.");
      }

      const runItems = await fetchRuns();
      const nextRunIndex = Number.isInteger(data.runIndex)
        ? Number(data.runIndex)
        : runItems.length > 0
          ? runItems[0].runIndex
          : null;

      setSelectedRunIndex(nextRunIndex);
      await fetchTask(nextRunIndex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить задачу.");
    }
  };

  const handleCancel = async () => {
    if (!taskId) return;

    try {
      const response = await fetch(`/api/tasks/${taskId}/cancel`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Не удалось остановить задачу.");
      }

      await Promise.all([fetchTask(selectedRunIndex), fetchRuns()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось остановить задачу.");
    }
  };

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    await navigator.clipboard.writeText(window.location.href);
  };

  const handleExport = async (format: "json" | "csv" | "txt") => {
    if (!taskId) return;
    const activeRunIndex =
      selectedRunIndex ?? task?.selectedRunIndex ?? task?.currentRunIndex ?? 0;
    const url = `/api/tasks/${taskId}/export?format=${format}&runIndex=${activeRunIndex}`;
    const response = await fetch(url);
    if (!response.ok) {
      setError("Экспорт недоступен.");
      return;
    }
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `task-${taskId}.${format === "txt" ? "txt" : format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    setExportOpen(false);
  };

  const handleRunChange = async (value: string) => {
    const nextRunIndex = Number(value);
    if (!Number.isInteger(nextRunIndex)) return;

    setSelectedRunIndex(nextRunIndex);
    try {
      await fetchTask(nextRunIndex);
    } catch {
      setError("Не удалось переключить запуск.");
    }
  };

  const filteredSteps = useMemo(() => {
    const byOrder = new Map<number, TaskStep>();
    steps.forEach((step) => {
      const attempt = step.attempt ?? 1;
      const existing = byOrder.get(step.order);
      if (!existing || (existing.attempt ?? 1) < attempt) {
        byOrder.set(step.order, step);
      }
    });
    return Array.from(byOrder.values()).sort((a, b) => a.order - b.order);
  }, [steps]);

  const filteredMessages = useMemo(() => messages, [messages]);

  const agentParticipants = useMemo(() => {
    return Array.from(
      new Set(filteredSteps.filter((step) => step.agentId).map((step) => step.agentId as string))
    );
  }, [filteredSteps]);

  const activeRunStatus = selectedRun?.status || task?.status || "queued";
  const activeRunDuration = selectedRun?.durationMs ?? task?.durationMs ?? null;

  if (loading) {
    return <div className="text-sm text-[#5A6072]">Загрузка...</div>;
  }

  if (!task) {
    return <ErrorState message={error ?? "Задача не найдена"} />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={task.title || "Задача"}
        subtitle={task.inputText}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/tasks")}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={handleRun}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Запустить
            </button>
            {activeRunStatus === "running" && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-500"
              >
                Остановить
              </button>
            )}
            <button
              type="button"
              onClick={handleRun}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
            >
              Запустить снова
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Скопировать ссылку
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((prev) => !prev)}
                className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
              >
                Экспорт
              </button>
              {exportOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
                  <button
                    type="button"
                    onClick={() => handleExport("json")}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[#F8F9FF]"
                  >
                    Скачать JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("csv")}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[#F8F9FF]"
                  >
                    Скачать CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("txt")}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[#F8F9FF]"
                  >
                    Скачать TXT
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />

      {error && <ErrorState message={error} />}

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Запуск</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {runs.length === 0 ? (
                <span className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#5A6072]">
                  Запусков пока нет
                </span>
              ) : (
                <select
                  value={String(selectedRunIndex ?? runs[0]?.runIndex ?? "")}
                  onChange={(event) => handleRunChange(event.target.value)}
                  className="max-w-[320px] rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#1F2238]"
                >
                  {runs.map((run) => (
                    <option key={run.runIndex} value={run.runIndex}>
                      {`#${run.runIndex} • ${run.status} • ${formatDurationCompact(run.durationMs)} • ${formatRunTime(run.startedAt)}`}
                    </option>
                  ))}
                </select>
              )}
              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(activeRunStatus)}`}
              >
                {activeRunStatus}
              </span>
              <span className="text-xs text-[#5A6072]">{formatDurationCompact(activeRunDuration)}</span>
            </div>
            <div className="mt-2 text-xs text-[#5A6072]">Обновлено {formatRelativeTime(task.updatedAt)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Агенты</div>
            <div className="mt-2 flex items-center gap-2">
              {agentParticipants.length === 0 && <span className="text-xs text-[#5A6072]">—</span>}
              {agentParticipants.map((agentId) => {
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
            </div>
          </div>
        </div>
        {task.errorText && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
            Ошибка: {task.errorText}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Прогресс</div>
        <div className="mt-4 grid gap-3">
          {filteredSteps.length === 0 ? (
            <p className="text-sm text-[#5A6072]">Шагов пока нет.</p>
          ) : (
            filteredSteps.map((step) => {
              const agent = step.agentId ? getAgentById(step.agentId) : null;
              const label = agent?.name || step.toolSlug || step.agentId || "Шаг";
              return (
                <div
                  key={step.id}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[#1F2238]">{label}</div>
                      <div className="text-xs text-[#5A6072]">
                        {step.status} • {step.durationMs ? `${Math.round(step.durationMs / 1000)} сек` : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStep(selectedStep === step.id ? null : step.id)}
                        className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                      >
                        Открыть лог
                      </button>
                      {step.status === "error" && (
                        <button
                          type="button"
                          onClick={async () => {
                            const runIndexForRetry =
                              selectedRunIndex ?? task.selectedRunIndex ?? task.currentRunIndex;
                            await fetch(`/api/tasks/${taskId}/retry-step`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ stepId: step.id, runIndex: runIndexForRetry })
                            });
                            await Promise.all([fetchTask(runIndexForRetry), fetchRuns()]);
                          }}
                          className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-500"
                        >
                          Повторить
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedStep === step.id && (
                    <div className="mt-3 grid gap-3 text-xs text-[#1F2238]">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">Input</div>
                        <pre className="mt-2 max-h-[200px] overflow-auto rounded-xl border border-slate-200/70 bg-white px-3 py-2">
                          {step.inputJson || "—"}
                        </pre>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">Output</div>
                        <pre className="mt-2 max-h-[200px] overflow-auto rounded-xl border border-slate-200/70 bg-white px-3 py-2">
                          {step.outputJson || "—"}
                        </pre>
                      </div>
                      {step.errorText && <div className="text-red-500">Ошибка: {step.errorText}</div>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Логи / Сообщения</div>
        <div className="mt-4 space-y-3">
          {filteredMessages.length === 0 ? (
            <p className="text-sm text-[#5A6072]">Сообщений пока нет.</p>
          ) : (
            filteredMessages.map((message) => {
              const agent = message.agentId ? getAgentById(message.agentId) : null;
              const label = message.role === "user" ? "Пользователь" : agent?.name || "Система";
              return (
                <div
                  key={message.id}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#1F2238]">{label}</div>
                    <div className="text-xs text-[#5A6072]">
                      {new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-[#1F2238] whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Результат</div>
        {task.outputSummary ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3 text-sm text-[#1F2238] whitespace-pre-wrap">
              {task.outputSummary}
            </div>
            <details className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs">
              <summary className="cursor-pointer text-sm font-semibold text-[#3E3A8C]">Полный JSON</summary>
              <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-slate-200/70 bg-[#F8F9FF] px-3 py-2">
                {JSON.stringify(
                  filteredSteps.map((step) => ({
                    agentId: step.agentId,
                    output: parseJsonSafe(step.outputJson)
                  })),
                  null,
                  2
                )}
              </pre>
            </details>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#5A6072]">Пока нет результатов.</p>
        )}
      </div>
    </div>
  );
}
