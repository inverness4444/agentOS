"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/StateBlocks";

type Tool = {
  id: string;
  name: string;
  slug: string;
};

type ToolRun = {
  id: string;
  toolSlug: string;
  status: string;
  startedAt: string;
  durationMs: number;
  inputJson?: string | null;
  outputJson?: string | null;
  errorText?: string | null;
};

const parseJsonSafe = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

function ToolsRunsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toolSlugParam = searchParams?.get("toolSlug") || "";

  const [tools, setTools] = useState<Tool[]>([]);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState(toolSlugParam);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSlug(toolSlugParam);
  }, [toolSlugParam]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (selectedSlug) {
        query.set("toolSlug", selectedSlug);
      }
      query.set("limit", "50");
      const [toolsResponse, runsResponse] = await Promise.all([
        fetch("/api/tools"),
        fetch(`/api/tools/runs?${query.toString()}`)
      ]);

      if (!toolsResponse.ok) {
        throw new Error("Не удалось загрузить инструменты.");
      }
      const toolsData = await toolsResponse.json();
      setTools(
        (toolsData.tools ?? []).map((tool: any) => ({
          id: tool.id,
          name: tool.name,
          slug: tool.slug
        }))
      );

      if (!runsResponse.ok) {
        throw new Error("Не удалось загрузить логи.");
      }
      const runsData = await runsResponse.json();
      setRuns(runsData.runs ?? []);
    } catch (err) {
      setError("Не удалось загрузить логи.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [selectedSlug]);

  const toolNameBySlug = useMemo(() => {
    const map = new Map<string, string>();
    tools.forEach((tool) => map.set(tool.slug, tool.name));
    return map;
  }, [tools]);

  const handleSelectTool = (slug: string) => {
    if (slug) {
      router.push(`/tools/runs?toolSlug=${slug}`);
    } else {
      router.push("/tools/runs");
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Логи запусков инструментов"
        subtitle="Проверяйте последние запуски и результаты выполнения."
        action={
          <button
            type="button"
            onClick={() => router.push("/tools")}
            className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
          >
            Назад к инструментам
          </button>
        }
      />

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-4 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Фильтр</div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select
            value={selectedSlug}
            onChange={(event) => handleSelectTool(event.target.value)}
            className="rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm"
          >
            <option value="">Все инструменты</option>
            {tools.map((tool) => (
              <option key={tool.slug} value={tool.slug}>
                {tool.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="Логов пока нет"
            description="Запустите инструмент, чтобы увидеть историю."
          />
        ) : (
          <div className="space-y-4">
            {runs.map((run) => {
              const toolName = toolNameBySlug.get(run.toolSlug) || run.toolSlug;
              const input = parseJsonSafe(run.inputJson);
              const output = parseJsonSafe(run.outputJson);
              const isOpen = expandedId === run.id;
              return (
                <div
                  key={run.id}
                  className="rounded-2xl border border-slate-200/70 bg-white px-4 py-4"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : run.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#1F2238]">{toolName}</div>
                      <div className="text-xs text-[#5A6072]">
                        {new Date(run.startedAt).toLocaleString("ru-RU")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#5A6072]">
                      <span>{run.durationMs} ms</span>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                          run.status === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {run.status}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-slate-200/70 bg-[#F8F9FF] p-3 text-xs text-[#1F2238]">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#7C7CF6]">
                            Input
                          </div>
                          <pre className="whitespace-pre-wrap">{JSON.stringify(input ?? {}, null, 2)}</pre>
                        </div>
                        <div className="rounded-xl border border-slate-200/70 bg-[#F8F9FF] p-3 text-xs text-[#1F2238]">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#7C7CF6]">
                            Output
                          </div>
                          {run.errorText ? (
                            <div className="text-red-600">{run.errorText}</div>
                          ) : (
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(output ?? {}, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-[#7C7CF6]">
                        Run ID: {run.id}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ToolsRunsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-black">Загрузка…</div>}>
      <ToolsRunsPageContent />
    </Suspense>
  );
}
