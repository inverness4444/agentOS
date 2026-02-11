"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AgentHeader from "@/components/agents/AgentHeader";
import BuildSidebarNav from "@/components/agents/BuildSidebarNav";
import PromptEditor from "@/components/agents/PromptEditor";
import RightPanelAccordions from "@/components/agents/RightPanelAccordions";
import AgentChatWorkspace from "@/components/agents/AgentChatWorkspace";
import type { AgentConfig } from "@/lib/agents/config";
import { ErrorState } from "@/components/app/StateBlocks";
import { getAgentPhotoByName } from "@/lib/data";

type AgentRecord = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  published: boolean;
  config: AgentConfig;
};

type AgentKnowledgeItem = {
  linkId: string;
  id: string;
  title: string;
  type: string;
  source_url?: string | null;
  updatedAt: string;
};

const buildSections = [
  {
    id: "prompt",
    label: "Prompt",
    description: "Create guidelines for your agent"
  },
  {
    id: "tools",
    label: "Tools",
    description: "Used by agents to complete tasks"
  },
  {
    id: "knowledge",
    label: "Knowledge",
    description: "Add your documents and data"
  },
  {
    id: "triggers",
    label: "Triggers",
    description: "Run tasks on autopilot"
  },
  {
    id: "alerts",
    label: "Alerts",
    description: "Notifications and monitoring"
  },
  {
    id: "memory",
    label: "Memory",
    description: "Long-term context"
  },
  {
    id: "variables",
    label: "Variables",
    description: "Reusable input values"
  }
];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id as string;

  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"Saved" | "Saving">("Saved");
  const [publishing, setPublishing] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [runDraftPrompt, setRunDraftPrompt] = useState("");

  const [knowledgeItems, setKnowledgeItems] = useState<AgentKnowledgeItem[]>([]);
  const [knowledgeTools, setKnowledgeTools] = useState<{ id: string; name: string }[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeModal, setKnowledgeModal] = useState<
    "file" | "website" | "integration" | "note" | null
  >(null);
  const [knowledgeScope, setKnowledgeScope] = useState<"agent" | "workspace">("agent");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeUrl, setKnowledgeUrl] = useState("");
  const [knowledgeTool, setKnowledgeTool] = useState("");
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const [knowledgeSubmitting, setKnowledgeSubmitting] = useState(false);

  const activeTab = useMemo(() => {
    const tab = searchParams?.get("tab")?.toLowerCase();
    return tab === "build" ? "build" : "run";
  }, [searchParams]);

  const setTab = (tab: "build" | "run") => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("tab", tab);
    router.replace(`/agents/${id}?${params.toString()}`);
  };

  const agentAvatar = useMemo(() => {
    return agent?.name ? getAgentPhotoByName(agent.name) : null;
  }, [agent?.name]);

  const statusLabel = useMemo(() => {
    if (publishing) return "Publishing...";
    if (saveState === "Saving") return "Saving...";
    if (agent?.published) return "Published";
    return "Saved";
  }, [agent?.published, publishing, saveState]);

  const loadAgent = async () => {
    if (!id) return;
    setError(null);
    try {
      const response = await fetch(`/api/agents/${id}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить агента.");
      }
      const data = await response.json();
      setAgent(data.agent);
      setConfig(data.agent.config);
      setSaveState("Saved");
    } catch (err) {
      setError("Не удалось загрузить агента.");
    }
  };

  const loadKnowledge = async () => {
    if (!id) return;
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      const [linksResponse, toolsResponse] = await Promise.all([
        fetch(`/api/knowledge-links?agent_id=${id}`),
        fetch("/api/tools")
      ]);
      if (!linksResponse.ok) {
        throw new Error("Не удалось загрузить знания агента.");
      }
      const data = await linksResponse.json();
      const items = (data.items ?? []).map((item: any) => ({
        linkId: item.link_id,
        id: item.id,
        title: item.title,
        type: item.type,
        source_url: item.source_url ?? null,
        updatedAt: item.updatedAt
      }));
      setKnowledgeItems(items);
      if (toolsResponse.ok) {
        const toolsData = await toolsResponse.json();
        setKnowledgeTools(
          (toolsData.tools ?? []).map((tool: { id: string; name: string }) => ({
            id: tool.id,
            name: tool.name
          }))
        );
      }
    } catch (err) {
      setKnowledgeError("Не удалось загрузить знания агента.");
    } finally {
      setKnowledgeLoading(false);
    }
  };

  useEffect(() => {
    loadAgent();
  }, [id]);

  useEffect(() => {
    loadKnowledge();
  }, [id]);

  useEffect(() => {
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current);
      }
    };
  }, []);

  const openKnowledgeModal = (type: "file" | "website" | "integration" | "note") => {
    setKnowledgeModal(type);
    setKnowledgeScope("agent");
    setKnowledgeTitle("");
    setKnowledgeContent("");
    setKnowledgeUrl("");
    setKnowledgeTool("");
    setKnowledgeFile(null);
  };

  const closeKnowledgeModal = () => {
    setKnowledgeModal(null);
    setKnowledgeTitle("");
    setKnowledgeContent("");
    setKnowledgeUrl("");
    setKnowledgeTool("");
    setKnowledgeFile(null);
  };

  const handleKnowledgeSubmit = async () => {
    if (!knowledgeModal || !id) return;
    if (knowledgeModal === "file" && !knowledgeFile) return;
    if (knowledgeModal === "website" && !knowledgeUrl.trim()) return;
    if (knowledgeModal === "integration" && !knowledgeTool) return;
    if (knowledgeModal === "note" && !knowledgeTitle.trim() && !knowledgeContent.trim()) return;

    setKnowledgeSubmitting(true);

    let title = knowledgeTitle.trim();
    let content = knowledgeContent.trim();
    let meta: Record<string, string> = {};

    if (knowledgeModal === "file") {
      title = title || knowledgeFile?.name || "Загруженный файл";
      content = "";
      meta = { fileName: knowledgeFile?.name ?? "" };
    }

    if (knowledgeModal === "website") {
      title = title || knowledgeUrl.trim();
      content = content || "";
      meta = { url: knowledgeUrl.trim() };
    }

    if (knowledgeModal === "integration") {
      const selectedTool = knowledgeTools.find((tool) => tool.id === knowledgeTool);
      title = title || selectedTool?.name || "Интеграция";
      meta = { toolId: knowledgeTool };
    }

    if (knowledgeModal === "note") {
      title = title || "Новые знания";
    }

    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        type: knowledgeModal,
        content,
        meta,
        scope: knowledgeScope,
        agent_id: knowledgeScope === "agent" ? id : undefined
      })
    });

    if (response.ok) {
      await loadKnowledge();
      closeKnowledgeModal();
    }

    setKnowledgeSubmitting(false);
  };

  const handleKnowledgeDetach = async (item: AgentKnowledgeItem) => {
    if (!item.linkId) return;
    await fetch(`/api/knowledge-links/${item.linkId}`, { method: "DELETE" });
    loadKnowledge();
  };

  const queueSave = (nextConfig: AgentConfig) => {
    if (!id) return;
    setConfig(nextConfig);
    setSaveState("Saving");
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current);
    }
    saveTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/agents/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: nextConfig })
        });
        if (!response.ok) {
          throw new Error("Не удалось сохранить агента.");
        }
        const data = await response.json();
        setAgent(data.agent);
        setConfig(data.agent.config);
        setSaveState("Saved");
      } catch (err) {
        setError("Не удалось сохранить агента.");
        setSaveState("Saved");
      }
    }, 900);
  };

  const handleTogglePublished = async () => {
    if (!agent || !config) return;
    const nextPublished = !agent.published;
    const nextConfig: AgentConfig = {
      ...config,
      publishedStatus: nextPublished ? "Published" : "Saved"
    };
    setConfig(nextConfig);
    setPublishing(true);
    try {
      const response = await fetch(`/api/agents/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: nextPublished, config: nextConfig })
      });
      if (!response.ok) {
        throw new Error("Не удалось обновить статус.");
      }
      const data = await response.json();
      setAgent(data.agent);
    } catch (err) {
      setError("Не удалось обновить статус.");
    } finally {
      setPublishing(false);
    }
  };

  const handleTestAgent = () => {
    if (!config) return;
    setRunDraftPrompt(config.runExamplePrompt || "");
    setTab("run");
  };

  if (!agent && error) {
    return <ErrorState message={error} />;
  }

  if (!agent || !config) {
    return <div className="text-sm text-[#5A6072]">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      <AgentHeader
        name={agent.name}
        avatarUrl={agentAvatar}
        statusLabel={statusLabel}
        published={agent.published}
        onTogglePublished={handleTogglePublished}
        onBack={() => router.push("/agents")}
      />

      {error && <ErrorState message={error} />}

      {activeTab === "build" ? (
        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)_300px]">
          <BuildSidebarNav sections={buildSections} />
          <div className="space-y-6">
            <PromptEditor
              agentName={agent.name}
              agentDescription={agent.description}
              avatarUrl={agentAvatar}
              model={config.model}
              role={config.prompt.role}
              sop={config.prompt.sop}
              output={config.prompt.output}
              onModelChange={(value) =>
                queueSave({ ...config, model: value })
              }
              onRoleChange={(value) =>
                queueSave({
                  ...config,
                  prompt: { ...config.prompt, role: value }
                })
              }
              onSopChange={(value) =>
                queueSave({
                  ...config,
                  prompt: { ...config.prompt, sop: value }
                })
              }
              onOutputChange={(value) =>
                queueSave({
                  ...config,
                  prompt: { ...config.prompt, output: value }
                })
              }
              onRefine={() => {}}
              onTest={handleTestAgent}
            />

            <div id="tools" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Tools</div>
              <p className="mt-3 text-sm text-[#5A6072]">
                Добавьте инструменты, чтобы расширить возможности агента.
              </p>
            </div>

            <div id="knowledge" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Knowledge</div>
                <button
                  type="button"
                  onClick={() => openKnowledgeModal("note")}
                  className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-xs font-semibold text-[#3E3A8C]"
                >
                  + Добавить знание
                </button>
              </div>
              <p className="mt-3 text-sm text-[#5A6072]">
                Подключите документы и заметки. Знания могут быть общими или только для этого агента.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {[
                  { id: "file", label: "Файл" },
                  { id: "website", label: "Сайт" },
                  { id: "integration", label: "Интеграция" },
                  { id: "note", label: "Заметка" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openKnowledgeModal(item.id as "file" | "website" | "integration" | "note")}
                    className="rounded-full border border-slate-200 px-3 py-1 text-[#5A6072]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {knowledgeError && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {knowledgeError}
                </div>
              )}
              <div className="mt-4 space-y-2">
                {knowledgeLoading ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-3 py-4 text-center text-xs text-[#5A6072]">
                    Загрузка знаний...
                  </div>
                ) : knowledgeItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-3 py-4 text-center text-xs text-[#5A6072]">
                    Пока нет привязанных знаний.
                  </div>
                ) : (
                  knowledgeItems.map((item) => (
                    <div
                      key={item.linkId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-3"
                    >
                      <div>
                        <div className="text-sm font-semibold text-[#1F2238]">{item.title}</div>
                        <div className="text-xs text-[#5A6072]">{item.type}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleKnowledgeDetach(item)}
                        className="rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C]"
                      >
                        Detach
                      </button>
                    </div>
                  ))
                )}
              </div>
              {knowledgeModal && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                    Новое знание
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#5A6072]">
                    <span>Сделать общим (workspace)</span>
                    <input
                      type="checkbox"
                      checked={knowledgeScope === "workspace"}
                      onChange={(event) =>
                        setKnowledgeScope(event.target.checked ? "workspace" : "agent")
                      }
                    />
                  </div>
                  <div className="mt-4 space-y-3">
                    <input
                      value={knowledgeTitle}
                      onChange={(event) => setKnowledgeTitle(event.target.value)}
                      placeholder="Название"
                      className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
                    />
                    {knowledgeModal === "file" && (
                      <input
                        type="file"
                        onChange={(event) => setKnowledgeFile(event.target.files?.[0] ?? null)}
                        className="w-full text-xs text-[#5A6072]"
                      />
                    )}
                    {knowledgeModal === "website" && (
                      <input
                        value={knowledgeUrl}
                        onChange={(event) => setKnowledgeUrl(event.target.value)}
                        placeholder="URL сайта"
                        className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
                      />
                    )}
                    {knowledgeModal === "integration" && (
                      <select
                        value={knowledgeTool}
                        onChange={(event) => setKnowledgeTool(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]"
                      >
                        <option value="">Выберите интеграцию</option>
                        {knowledgeTools.map((tool) => (
                          <option key={tool.id} value={tool.id}>
                            {tool.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {knowledgeModal === "note" && (
                      <textarea
                        value={knowledgeContent}
                        onChange={(event) => setKnowledgeContent(event.target.value)}
                        rows={6}
                        placeholder="Содержание"
                        className="w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238]"
                      />
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleKnowledgeSubmit}
                      disabled={knowledgeSubmitting}
                      className="rounded-full bg-[#5C5BD6] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      onClick={closeKnowledgeModal}
                      className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-xs font-semibold text-[#3E3A8C]"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div id="triggers" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Triggers</div>
              <p className="mt-3 text-sm text-[#5A6072]">
                Настройте события, которые запускают агента.
              </p>
            </div>

            <div id="alerts" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Alerts</div>
              <p className="mt-3 text-sm text-[#5A6072]">
                Настройте уведомления о статусах и событиях.
              </p>
            </div>

            <div id="memory" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Memory</div>
              <p className="mt-3 text-sm text-[#5A6072]">
                Опишите, какую долговременную память использовать.
              </p>
            </div>

            <div id="variables" className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Variables</div>
              <p className="mt-3 text-sm text-[#5A6072]">
                Управляйте доступными переменными для промта.
              </p>
            </div>
          </div>
          <RightPanelAccordions config={config} />
        </div>
      ) : (
        <AgentChatWorkspace
          agentId={agent.id}
          agentName={agent.name}
          avatarUrl={agentAvatar}
          initialInput={runDraftPrompt}
        />
      )}
    </div>
  );
}
