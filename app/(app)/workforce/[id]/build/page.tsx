"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { ErrorState } from "@/components/app/StateBlocks";

const parseJsonSafe = (value: string | null | undefined, fallback: any) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export default function WorkforceBuildPage() {
  const router = useRouter();
  const params = useParams();
  const workflowId = params?.id as string;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState<{ steps: any[] }>({ steps: [] });
  const [definitionText, setDefinitionText] = useState("{}");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setName(data.workflow?.name || "Workflow");
      setDescription(data.workflow?.description || "");
      const parsed = parseJsonSafe(data.workflow?.definitionJson, { steps: [] });
      setDefinition(parsed);
      setDefinitionText(JSON.stringify(parsed, null, 2));
      setAdvancedMode(Boolean(data.viewer?.advancedMode));
    } catch (err) {
      setError("Не удалось загрузить workflow.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  const addStep = (type: string) => {
    const newStep = {
      id: crypto.randomUUID(),
      type,
      ...(type === "tool" ? { toolSlug: "ru_places_search", inputMapping: {} } : {}),
      ...(type === "transform" ? { mode: "json_transform", config: { rules: [] } } : {}),
      ...(type === "note" ? { text: "Новый шаг" } : {})
    };
    const updated = { steps: [...(definition.steps || []), newStep] };
    setDefinition(updated);
    setDefinitionText(JSON.stringify(updated, null, 2));
  };

  const handleSave = async () => {
    if (!workflowId) return;
    setSaving(true);
    setError(null);
    const parsed = parseJsonSafe(definitionText, null);
    if (!parsed) {
      setError("Некорректный JSON definition");
      setSaving(false);
      return;
    }
    const response = await fetch(`/api/workforce/workflows/${workflowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        definitionJson: JSON.stringify(parsed)
      })
    });
    if (!response.ok) {
      setError("Не удалось сохранить workflow.");
    } else {
      setDefinition(parsed);
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!workflowId) return;
    const response = await fetch(`/api/workforce/workflows/${workflowId}/publish`, {
      method: "POST"
    });
    if (!response.ok) {
      setError("Не удалось опубликовать workflow.");
    } else {
      router.push(`/workforce/${workflowId}`);
    }
  };

  const stepsPreview = useMemo(() => definition?.steps || [], [definition]);

  if (loading) {
    return <div className="text-sm text-[#5A6072]">Загрузка...</div>;
  }

  if (!advancedMode) {
    return (
      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 text-sm text-[#5A6072] shadow-soft">
        Режим Build доступен только в Advanced Mode.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={name || "Workflow"}
        subtitle="Соберите цепочку шагов и подготовьте workflow к запуску."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/workforce/${workflowId}`)}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              Run
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
            >
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
            >
              Publish
            </button>
          </div>
        }
      />

      {error && <ErrorState message={error} />}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
          <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Канва</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {stepsPreview.length === 0 ? (
              <div className="text-sm text-[#5A6072]">Пока нет шагов. Добавьте первый.</div>
            ) : (
              stepsPreview.map((step: any) => (
                <div
                  key={step.id}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3"
                >
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                    {step.type}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#1F2238]">
                    {step.toolSlug || step.mode || step.text || step.id}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {["tool", "transform", "note", "condition"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => addStep(type)}
                className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1.5 text-xs font-semibold text-[#3E3A8C]"
              >
                + {type}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
          <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Definition JSON</div>
          <textarea
            value={definitionText}
            onChange={(event) => setDefinitionText(event.target.value)}
            rows={18}
            className="mt-4 w-full rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3 text-xs text-[#1F2238]"
          />
        </div>
      </div>
    </div>
  );
}
