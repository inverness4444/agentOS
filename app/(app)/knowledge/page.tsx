"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/StateBlocks";
import RowActions from "@/components/app/RowActions";

type KnowledgeItem = {
  id: string;
  link_id?: string | null;
  title: string;
  type: string;
  scope?: "workspace" | "agent";
  agent_id?: string | null;
  updatedAt: string;
};

const pageSize = 25;

export default function KnowledgePage() {
  const router = useRouter();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalType, setModalType] = useState<"file" | "website" | "note" | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [knowledgeScope, setKnowledgeScope] = useState<"workspace" | "agent">("workspace");
  const [knowledgeAgentId, setKnowledgeAgentId] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const [knowledgeResponse, agentsResponse] = await Promise.all([
        fetch("/api/knowledge"),
        fetch("/api/agents")
      ]);
      if (!knowledgeResponse.ok) {
        throw new Error("Не удалось загрузить знания.");
      }
      const data = await knowledgeResponse.json();
      setItems(data.items ?? []);
      if (agentsResponse.ok) {
        const agentsData = await agentsResponse.json();
        setAgents(
          (agentsData.agents ?? []).map((agent: { id: string; name: string }) => ({
            id: agent.id,
            name: agent.name
          }))
        );
      }
    } catch (err) {
      setError("Не удалось загрузить знания.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

  const agentNameMap = useMemo(() => {
    return new Map(agents.map((agent) => [agent.id, agent.name]));
  }, [agents]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openModal = (type: "file" | "website" | "note") => {
    setModalType(type);
    setTitleInput("");
    setContentInput("");
    setUrlInput("");
    setFileInput(null);
    setKnowledgeScope("workspace");
    setKnowledgeAgentId("");
    setModalError(null);
  };

  const closeModal = () => {
    setModalType(null);
    setTitleInput("");
    setContentInput("");
    setUrlInput("");
    setFileInput(null);
    setKnowledgeScope("workspace");
    setKnowledgeAgentId("");
    setModalError(null);
  };

  const handleSubmit = async () => {
    if (!modalType) return;

    if (modalType === "file" && !fileInput) return;
    if (modalType === "website" && !urlInput.trim()) return;
    if (modalType === "note" && !titleInput.trim() && !contentInput.trim()) return;
    if (knowledgeScope === "agent" && !knowledgeAgentId) {
      setModalError("Выберите агента, чтобы привязать это знание.");
      return;
    }

    setModalError(null);
    setSubmitting(true);

    let title = titleInput.trim();
    let content = contentInput.trim();
    let meta: Record<string, string> = {};

    if (modalType === "file") {
      title = title || fileInput?.name || "Загруженный файл";
      content = "";
      meta = { fileName: fileInput?.name ?? "" };
    }

    if (modalType === "website") {
      title = title || urlInput.trim();
      content = content || "";
      meta = { url: urlInput.trim() };
    }

    if (modalType === "note") {
      title = title || "Новые знания";
    }

    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        type: modalType,
        content,
        meta,
        scope: knowledgeScope,
        agent_id: knowledgeScope === "agent" ? knowledgeAgentId : undefined
      })
    });

    if (response.ok) {
      await fetchItems();
      closeModal();
    } else {
      let message = "Не удалось сохранить знание.";
      try {
        const payload = await response.json();
        if (payload?.error) {
          message = String(payload.error);
        }
      } catch {
        // ignore
      }
      setModalError(message);
    }

    setSubmitting(false);
  };

  const handleRename = async (item: KnowledgeItem) => {
    const title = window.prompt("Новое название документа", item.title);
    if (!title || title.trim() === item.title) return;
    await fetch(`/api/knowledge/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() })
    });
    fetchItems();
  };

  const handleDuplicate = async (item: KnowledgeItem) => {
    let fullItem: KnowledgeItem & { content?: string; meta?: string } = item;
    try {
      const response = await fetch(`/api/knowledge/${item.id}`);
      if (response.ok) {
        const data = await response.json();
        fullItem = data.item;
      }
    } catch {
      // ignore
    }
    let metaData: any = {};
    try {
      metaData = fullItem.meta ? JSON.parse(fullItem.meta) : {};
    } catch {
      metaData = {};
    }

    await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${fullItem.title} копия`,
        type: fullItem.type,
        content: fullItem.content ?? "",
        meta: metaData,
        scope: item.scope ?? "workspace",
        agent_id: item.scope === "agent" ? item.agent_id ?? undefined : undefined
      })
    });
    fetchItems();
  };

  const handleDelete = async (item: KnowledgeItem) => {
    if (!window.confirm("Удалить документ?")) return;
    await fetch(`/api/knowledge/${item.id}`, { method: "DELETE" });
    fetchItems();
  };

  const getScopeLabel = (item: KnowledgeItem) => {
    if (item.scope === "agent") {
      const agentName =
        (item.agent_id ? agentNameMap.get(item.agent_id) : null) ?? "конкретный агент";
      return `Для: ${agentName}`;
    }
    return "Для: все агенты";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-lg font-semibold text-[#111827]">Знание</div>
        <button
          type="button"
          onClick={() => openModal("note")}
          className="rounded-full bg-[#5C5BD6] px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
        >
          + Новые знания
        </button>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-[#161B3A] via-[#2B2C68] to-[#4A4CE6] px-6 py-8 text-white shadow-soft">
        <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.25)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative z-10">
          <h1 className="text-3xl font-semibold">Ваша база знаний</h1>
          <p className="mt-2 text-sm text-white/80">
            Соберите документы, источники и инструкции в одном месте.
          </p>
        </div>
      </div>

      <div className="flex w-full justify-center">
        <div className="flex w-fit flex-wrap items-center justify-center gap-6 rounded-full border border-[#D8DDF7] bg-white px-6 py-3 text-xs font-semibold text-[#1F2238] shadow-soft">
          {[
            { label: "Загрузить", type: "file", icon: "⬆️" },
            { label: "Веб-сайт", type: "website", icon: "🌐" },
            { label: "Пустой", type: "note", icon: "📝" }
          ].map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => openModal(item.type as "file" | "website" | "note")}
              className="flex items-center gap-2 text-sm font-semibold text-[#1F2238]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEF0FF] text-base">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-xl items-center gap-2 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238]">
          <span className="text-[#5A6072]">🔍</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent outline-none"
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white px-4 py-4 shadow-soft">
        {loading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState message={error} />
        ) : paged.length === 0 ? (
          <EmptyState
            title="Знаний пока нет"
            description="Добавьте документы, ссылки или заметки в базу знаний."
          />
        ) : (
          <div className="space-y-3">
            {paged.map((item) => (
              <div
                key={item.id}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-left transition hover:bg-[#F8F9FF]"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/knowledge/${item.id}`)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-sm font-semibold text-[#3E3A8C]">
                    {item.title.slice(0, 1).toUpperCase()}
                  </span>
                    <div>
                      <div className="text-sm font-semibold text-[#111827] whitespace-normal break-words">
                        {item.title}
                      </div>
                      <div className="text-xs text-[#5A6072]">
                        {getScopeLabel(item)}
                      </div>
                    </div>
                  </button>
                <div className="text-xs text-[#5A6072]">
                  {new Date(item.updatedAt).toLocaleDateString("ru-RU")}
                </div>
                <RowActions
                  onRename={() => handleRename(item)}
                  onDuplicate={() => handleDuplicate(item)}
                  onDelete={() => handleDelete(item)}
                />
              </div>
            ))}
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

      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200/70 bg-white p-6 shadow-lg">
            <div className="text-lg font-semibold text-[#111827]">
              {modalType === "file" && "Загрузить файл"}
              {modalType === "website" && "Добавить веб-сайт"}
              {modalType === "note" && "Создать заметку"}
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                  Применять к
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 text-sm text-[#1F2238]">
                    <input
                      type="radio"
                      name="knowledge-scope"
                      checked={knowledgeScope === "workspace"}
                      onChange={() => {
                        setKnowledgeScope("workspace");
                        setKnowledgeAgentId("");
                      }}
                    />
                    Все агенты
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200/70 px-3 py-2 text-sm text-[#1F2238]">
                    <input
                      type="radio"
                      name="knowledge-scope"
                      checked={knowledgeScope === "agent"}
                      onChange={() => setKnowledgeScope("agent")}
                    />
                    Конкретный агент
                  </label>
                </div>
                {knowledgeScope === "agent" && (
                  <>
                    <select
                      value={knowledgeAgentId}
                      onChange={(event) => setKnowledgeAgentId(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#111827]"
                    >
                      <option value="">Выберите агента</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                    {agents.length === 0 && (
                      <div className="mt-2 text-xs text-[#5A6072]">
                        Нет доступных агентов для привязки.
                      </div>
                    )}
                  </>
                )}
              </div>

              {(modalType === "note" || modalType === "website") && (
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                    Название
                  </div>
                  <input
                    value={titleInput}
                    onChange={(event) => setTitleInput(event.target.value)}
                    placeholder="Введите название"
                    className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#111827]"
                  />
                </div>
              )}

              {modalType === "file" && (
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                    Файл
                  </div>
                  <input
                    type="file"
                    onChange={(event) => setFileInput(event.target.files?.[0] ?? null)}
                    className="mt-2 w-full text-sm text-[#111827]"
                  />
                </div>
              )}

              {modalType === "website" && (
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                    Ссылка
                  </div>
                  <input
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    placeholder="https://"
                    className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#111827]"
                  />
                </div>
              )}

              {(modalType === "note" || modalType === "website") && (
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
                    Описание
                  </div>
                  <textarea
                    value={contentInput}
                    onChange={(event) => setContentInput(event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#111827]"
                  />
                </div>
              )}
            </div>

            {modalError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {modalError}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-sm font-semibold text-[#3E3A8C]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || (knowledgeScope === "agent" && agents.length === 0)}
                className="rounded-full bg-[#5C5BD6] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(92,91,214,0.35)]"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
