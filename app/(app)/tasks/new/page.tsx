"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PageHero from "@/components/app/PageHero";
import { AGENT_CATALOG } from "@/lib/tasks/catalog";

export default function NewTaskPage() {
  const router = useRouter();
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState<"auto" | "single_agent" | "team">("auto");
  const [selectedAgentId, setSelectedAgentId] = useState(AGENT_CATALOG[0]?.id || "");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!inputText.trim()) {
      setError("Опишите, что нужно сделать.");
      return;
    }
    if (mode === "team" && selectedAgents.length === 0) {
      setError("Выберите хотя бы одного агента.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText,
          mode,
          selectedAgentId: mode === "single_agent" ? selectedAgentId : null,
          selectedAgentIds: mode === "team" ? selectedAgents : [],
          toolsEnabled,
          knowledgeEnabled
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось создать задачу.");
      }
      const data = await response.json();
      const taskId = data.task?.id;
      if (!taskId) {
        throw new Error("Не удалось создать задачу.");
      }
      await fetch(`/api/tasks/${taskId}/run`, { method: "POST" });
      router.push(`/tasks/${taskId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запуска");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        title="Новая задача"
        subtitle="Опишите задачу и выберите режим запуска агентов."
        action={
          <button
            type="button"
            onClick={() => router.push("/tasks")}
            className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
          >
            Назад
          </button>
        }
      />

      <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Что нужно сделать?</div>
        <textarea
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          rows={6}
          placeholder="Например: Собери 30 стоматологий в Москве и дай CSV"
          className="mt-4 w-full rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3 text-sm text-[#1F2238]"
        />

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Режим запуска</div>
            <div className="mt-3 space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "auto"}
                  onChange={() => setMode("auto")}
                />
                Авто (agentOS сам выберет агентов)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "single_agent"}
                  onChange={() => setMode("single_agent")}
                />
                Один агент
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "team"}
                  onChange={() => setMode("team")}
                />
                Команда
              </label>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Параметры</div>
            <div className="mt-3 space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={toolsEnabled}
                  onChange={(event) => setToolsEnabled(event.target.checked)}
                />
                Разрешить инструменты
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={knowledgeEnabled}
                  onChange={(event) => setKnowledgeEnabled(event.target.checked)}
                />
                Использовать знание
              </label>
            </div>
          </div>
        </div>

        {mode === "single_agent" && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Выберите агента</div>
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-3 py-2 text-sm"
            >
              {AGENT_CATALOG.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "team" && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Команда агентов</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {AGENT_CATALOG.map((agent) => (
                <label key={agent.id} className="flex items-start gap-2 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                  />
                  <div>
                    <div className="text-sm font-semibold text-[#1F2238]">{agent.name}</div>
                    <div className="text-xs text-[#5A6072]">{agent.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mt-4 text-sm text-red-500">{error}</div>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="mt-6 rounded-full bg-[#5C5BD6] px-6 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
        >
          {loading ? "Запуск..." : "Запустить"}
        </button>
      </div>
    </div>
  );
}
