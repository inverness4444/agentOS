"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { ErrorState } from "@/components/app/StateBlocks";

const parseJsonSafe = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const inferSchemaFromValue = (value: any): any => {
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length ? inferSchemaFromValue(value[0]) : {}
    };
  }
  if (value === null) {
    return { type: "string" };
  }
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return { type: valueType };
  }
  if (valueType === "object") {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    Object.entries(value).forEach(([key, val]) => {
      properties[key] = inferSchemaFromValue(val);
      required.push(key);
    });
    return { type: "object", properties, required };
  }
  return { type: "string" };
};

type Tool = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  provider: string;
  inputSchemaJson: string;
  outputSchemaJson: string;
  configJson: string;
  updatedAt: string;
};

type ToolRun = {
  id: string;
  status: string;
  startedAt: string;
  durationMs: number;
  errorText?: string | null;
  inputJson?: string | null;
  outputJson?: string | null;
};

export default function ToolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [tool, setTool] = useState<Tool | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("default");
  const [isActive, setIsActive] = useState(true);
  const [inputSchema, setInputSchema] = useState("{}");
  const [outputSchema, setOutputSchema] = useState("{}");
  const [config, setConfig] = useState("{}");
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`/api/tools/${id}`);
        if (!response.ok) {
          throw new Error("Не удалось загрузить инструмент.");
        }
        const data = await response.json();
        setTool(data.tool);
        setName(data.tool.name ?? "");
        setDescription(data.tool.description ?? "");
        setCategory(data.tool.category ?? "default");
        setIsActive(Boolean(data.tool.isActive));
        setInputSchema(data.tool.inputSchemaJson ?? "{}");
        setOutputSchema(data.tool.outputSchemaJson ?? "{}");
        setConfig(data.tool.configJson ?? "{}");
      } catch (err) {
        setError("Не удалось загрузить инструмент.");
      }
    };
    if (id) {
      load();
    }
  }, [id]);

  useEffect(() => {
    const loadRuns = async () => {
      if (!tool?.slug) return;
      const response = await fetch(`/api/tools/runs?toolSlug=${tool.slug}&limit=15`);
      if (response.ok) {
        const data = await response.json();
        setRuns(data.runs ?? []);
      }
    };
    loadRuns();
  }, [tool?.slug]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/tools/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          category,
          isActive,
          inputSchemaJson: inputSchema,
          outputSchemaJson: outputSchema,
          configJson: config
        })
      });
      if (!response.ok) {
        throw new Error("Не удалось сохранить.");
      }
      const data = await response.json();
      setTool(data.tool);
    } catch (err) {
      setError("Не удалось сохранить инструмент.");
    } finally {
      setSaving(false);
    }
  };

  if (!tool && error) {
    return <ErrorState message={error} />;
  }

  const handleGenerateSchema = (setter: (value: string) => void) => {
    const example = window.prompt("Вставьте пример JSON");
    if (!example) return;
    try {
      const parsed = JSON.parse(example);
      const schema = inferSchemaFromValue(parsed);
      setter(JSON.stringify(schema, null, 2));
    } catch {
      setError("Некорректный JSON для генерации схемы.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title={tool?.name ?? "Инструмент"}
        subtitle="Настройте конфигурацию инструмента и просмотрите историю запусков."
        tabs={["Конфигурация", "Логи"]}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/tools")}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
            >
              Сохранить
            </button>
          </div>
        }
      />

      {error && <ErrorState message={error} />}

      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 md:col-span-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Название</div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Описание</div>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
            />
          </label>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Provider</div>
            <div className="mt-2 text-sm text-[#1F2238]">{tool?.provider}</div>
          </div>
          <label className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Category</div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
            >
              <option value="default">По умолчанию</option>
              <option value="integration">Интеграции</option>
              <option value="draft">Черновики</option>
            </select>
          </label>
          <label className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Статус</div>
            <select
              value={isActive ? "active" : "draft"}
              onChange={(event) => setIsActive(event.target.value === "active")}
              className="w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
          </label>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                Input Schema
              </div>
              <button
                type="button"
                onClick={() => handleGenerateSchema(setInputSchema)}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-[10px] font-semibold text-[#3E3A8C]"
              >
                Сгенерировать из примера
              </button>
            </div>
            <textarea
              value={inputSchema}
              onChange={(event) => setInputSchema(event.target.value)}
              rows={6}
              className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs text-[#1F2238]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                Output Schema
              </div>
              <button
                type="button"
                onClick={() => handleGenerateSchema(setOutputSchema)}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-[10px] font-semibold text-[#3E3A8C]"
              >
                Сгенерировать из примера
              </button>
            </div>
            <textarea
              value={outputSchema}
              onChange={(event) => setOutputSchema(event.target.value)}
              rows={6}
              className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-xs text-[#1F2238]"
            />
          </div>
        </div>
        <div className="mt-6 text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          Конфигурация (JSON)
        </div>
        <textarea
          value={config}
          onChange={(event) => setConfig(event.target.value)}
          rows={10}
          className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238]"
        />
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Логи</div>
        <div className="mt-4 space-y-3">
          {runs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-4 py-6 text-sm text-[#5A6072]">
              Запусков пока нет.
            </div>
          ) : (
            runs.map((run) => {
              const isOpen = expandedRunId === run.id;
              const input = parseJsonSafe(run.inputJson ?? "");
              const output = parseJsonSafe(run.outputJson ?? "");
              return (
                <div
                  key={run.id}
                  className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedRunId(isOpen ? null : run.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[#1F2238]">{run.status}</div>
                      <div className="text-xs text-[#5A6072]">
                        {new Date(run.startedAt).toLocaleString("ru-RU")}
                      </div>
                    </div>
                    <div className="text-xs text-[#5A6072]">{run.durationMs} ms</div>
                  </button>
                  {isOpen && (
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
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
