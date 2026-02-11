"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { ErrorState } from "@/components/app/StateBlocks";
import { CATEGORY_LIST } from "@/lib/tools/categories";

type Workflow = {
  id: string;
  name: string;
  description: string;
  status: string;
  isActive: boolean;
  isAdvanced: boolean;
  inputSchemaJson: string;
  outputSchemaJson: string;
};

type RunEntry = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  inputJson?: string | null;
  outputJson?: string | null;
  errorText?: string | null;
};

const categoryOptions = CATEGORY_LIST.map((item: any) => ({
  value: item.key,
  label: item.displayNameRu
}));

const parseJsonSafe = (value: string | null | undefined, fallback: any) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const buildDefaults = (schema: any) => {
  const output: Record<string, any> = {};
  if (!schema || schema.type !== "object") return output;
  const props = schema.properties || {};
  Object.entries(props).forEach(([key, prop]: any) => {
    if (prop.default !== undefined) {
      output[key] = prop.default;
    } else if (prop.type === "boolean") {
      output[key] = false;
    } else {
      output[key] = "";
    }
  });
  return output;
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

const buildCsv = (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const headers = ["name", "address", "lat", "lng", "website", "phone"];
  const escape = (value: any) => {
    const text = value === undefined || value === null ? "" : String(value);
    if (text.includes("\"")) {
      return `"${text.replace(/\"/g, '""')}"`;
    }
    if (text.includes(",") || text.includes("\n")) {
      return `"${text}"`;
    }
    return text;
  };
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((key) => escape(row[key])).join(","));
  });
  return lines.join("\n");
};

export default function WorkforceRunPage() {
  const router = useRouter();
  const params = useParams();
  const workflowId = params?.id as string;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [schema, setSchema] = useState<any>(null);
  const [input, setInput] = useState<Record<string, any>>({});
  const [result, setResult] = useState<any>(null);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const loadWorkflow = async () => {
    if (!workflowId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/workforce/workflows/${workflowId}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить workflow.");
      }
      const data = await response.json();
      setWorkflow(data.workflow);
      setAdvancedMode(Boolean(data.viewer?.advancedMode));
      const parsedSchema = parseJsonSafe(data.workflow?.inputSchemaJson, { type: "object", properties: {} });
      setSchema(parsedSchema);
      setInput(buildDefaults(parsedSchema));
    } catch (err) {
      setError("Не удалось загрузить workflow.");
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    if (!workflowId) return;
    try {
      const response = await fetch(`/api/workforce/runs?workflowId=${workflowId}`);
      if (!response.ok) return;
      const data = await response.json();
      setRuns(data.runs ?? []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  useEffect(() => {
    loadRuns();
  }, [workflowId]);

  const renderField = (key: string, prop: any) => {
    const value = input[key] ?? "";
    if (prop?.enum && key === "categoryKey") {
      return (
        <select
          value={value}
          onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        >
          <option value="">Выберите</option>
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      );
    }
    if (key === "categoryKey") {
      return (
        <select
          value={value}
          onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        >
          <option value="">Выберите</option>
          {categoryOptions.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      );
    }
    if (prop?.enum) {
      return (
        <select
          value={value}
          onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        >
          <option value="">Выберите</option>
          {prop.enum.map((item: string) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      );
    }
    if (prop?.type === "number") {
      return (
        <input
          type="number"
          value={value}
          onChange={(event) => setInput((prev) => ({ ...prev, [key]: Number(event.target.value) }))}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        />
      );
    }
    if (prop?.type === "boolean") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.checked }))}
          />
          <span>{prop?.description || ""}</span>
        </label>
      );
    }
    if (prop?.type === "object") {
      return (
        <textarea
          value={typeof value === "string" ? value : JSON.stringify(value || {})}
          onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
          rows={3}
          className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
        />
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(event) => setInput((prev) => ({ ...prev, [key]: event.target.value }))}
        className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
      />
    );
  };

  const handleRun = async () => {
    if (!workflowId) return;
    setRunning(true);
    setError(null);
    setResult(null);
    const preparedInput: Record<string, any> = { ...input };
    if (schema?.properties) {
      Object.entries(schema.properties).forEach(([key, prop]: any) => {
        if (prop?.type === "object" && typeof preparedInput[key] === "string") {
          try {
            preparedInput[key] = JSON.parse(preparedInput[key]);
          } catch {
            // keep raw string
          }
        }
      });
    }
    try {
      const response = await fetch("/api/workforce/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId, input: preparedInput })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Ошибка запуска");
      }
      setResult(payload.output || {});
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запуска");
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = () => {
    if (!result) return;
    const csvText = result.csv || buildCsv(result.leads || result.places || []);
    if (!csvText) return;
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${workflow?.name || "workflow"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const selectedRunData = useMemo(() => runs.find((item) => item.id === selectedRun), [runs, selectedRun]);

  if (loading) {
    return <div className="text-sm text-[#5A6072]">Загрузка...</div>;
  }

  if (!workflow) {
    return <ErrorState message={error ?? "Workflow не найден"} />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={workflow.name}
        subtitle={workflow.description}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/workforce")}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Назад
            </button>
            {advancedMode && (
              <button
                type="button"
                onClick={() => router.push(`/workforce/${workflow.id}/build`)}
                className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
              >
                Build
              </button>
            )}
          </div>
        }
      />

      {error && <ErrorState message={error} />}

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Запуск</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {schema?.properties ? (
            Object.entries(schema.properties).map(([key, prop]: any) => (
              <div key={key}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7C7CF6]">
                  {prop?.title || key}
                </div>
                {renderField(key, prop)}
              </div>
            ))
          ) : (
            <div className="text-sm text-[#5A6072]">Нет входной схемы.</div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
          >
            {running ? "Запуск..." : "Запустить"}
          </button>
          {result && (
            <button
              type="button"
              onClick={downloadCsv}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Скачать CSV
            </button>
          )}
        </div>

        {result && (
          <pre className="mt-5 max-h-[360px] overflow-auto rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3 text-xs text-[#1F2238]">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>

      <div id="runs" className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">История запусков</div>
        {runs.length === 0 ? (
          <p className="mt-3 text-sm text-[#5A6072]">Запусков пока нет.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRun(run.id === selectedRun ? null : run.id)}
                className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3 text-left text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">{formatRelativeTime(run.startedAt)}</div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      run.status === "success"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border border-red-200 bg-red-50 text-red-500"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[#5A6072]">Длительность: {run.durationMs} ms</div>
              </button>
            ))}
          </div>
        )}

        {selectedRunData && (
          <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs text-[#1F2238]">
            <div className="font-semibold">Детали запуска</div>
            <div className="mt-2">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">Input</div>
              <pre className="mt-2 max-h-[200px] overflow-auto rounded-xl border border-slate-200/70 bg-[#F8F9FF] px-3 py-2">
                {selectedRunData.inputJson}
              </pre>
            </div>
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">Output</div>
              <pre className="mt-2 max-h-[200px] overflow-auto rounded-xl border border-slate-200/70 bg-[#F8F9FF] px-3 py-2">
                {selectedRunData.outputJson || "—"}
              </pre>
            </div>
            {selectedRunData.errorText && (
              <div className="mt-3 text-red-500">Ошибка: {selectedRunData.errorText}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
