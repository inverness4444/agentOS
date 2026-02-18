"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

type ThreadStatus = "Done" | "Running" | "Error";

type AgentThread = {
  id: string;
  title: string;
  last_status: ThreadStatus;
  created_at: string;
  updated_at: string;
};

type AgentAttachment = {
  id?: string;
  filename: string;
  mime: string;
  size: number;
};

type AgentLead = {
  rank?: number;
  company_or_organization?: string;
  who?: string;
  title: string;
  url: string;
  normalized_url?: string;
  source?: string;
  source_type?: string;
  entity_role?: "buyer" | "vendor" | "media" | "directory" | "other" | string;
  geo?: string;
  snippet?: string;
  evidence?: string;
  why_match?: string;
  why_now?: string;
  contact_hint?: string;
  where_to_contact?: string;
  confidence?: number;
  lead_type?: "Hot" | "Warm" | string;
};

type AgentSearchDebugCall = {
  query?: string;
  provider?: string;
  fetched_at?: string;
  duration_ms?: number;
  status?: string;
  error?: string;
  usage_tokens?: number | null;
  results_count?: number;
  sample_urls?: string[];
};

type AgentSearchDebug = {
  queries?: string[];
  intent_json?: Record<string, unknown> | null;
  total_tokens?: number;
  llm_not_called?: boolean;
  models_per_step?: Record<string, string>;
  web_search?: {
    enabled?: boolean;
    reason?: string;
    provider?: string;
  };
  geo_scope?: "cis" | "global" | string;
  geo_drop_count?: number;
  geo_drop_examples?: Array<{ domain?: string; reason?: string; url?: string }>;
  search_target?: "buyer_only" | "competitor_scan" | string;
  candidates_from_input?: number;
  vendor_filtered_count?: number;
  entity_role_counts?: Record<string, number>;
  negative_keywords?: string[];
  filtered_irrelevant_count?: number;
  filtered_reasons?: Record<string, number>;
  source_categories?: Record<string, number>;
  dropped_articles_forums?: number;
  calls?: AgentSearchDebugCall[];
};

type AgentMessage = {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: AgentAttachment[];
  leads?: AgentLead[];
  search_debug?: AgentSearchDebug;
  routing?: {
    role_key?: string;
    allowed_task_types?: string[];
    requested_task_type?: string;
    out_of_role_but_completed?: boolean;
    recommended_runner_key?: string;
    recommended_agent_name?: string;
    recommended_agent_id?: string;
    transfer_available?: boolean;
  };
  status_code?: string;
  created_at: string;
};

type ThreadPayload = {
  thread: AgentThread;
  messages: AgentMessage[];
};

type AgentChatWorkspaceProps = {
  agentId: string;
  agentName: string;
  avatarUrl?: string | null;
  initialInput?: string;
  attached?: boolean;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const statusClass = (status: ThreadStatus) => {
  if (status === "Done") {
    return "border-[#CBEFD7] bg-[#F0FFF5] text-[#1E7A3D]";
  }
  if (status === "Running") {
    return "border-[#D8DDF7] bg-[#EEF0FF] text-[#3E3A8C]";
  }
  return "border-[#F3CCD0] bg-[#FFF1F2] text-[#B42318]";
};

const statusLabel = (status: ThreadStatus) => {
  if (status === "Done") return "Done";
  if (status === "Running") return "Running";
  return "Error";
};

const buildThreadTitle = (value: string) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 8).join(" ") || "Новый диалог";
};

const fileLabel = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || "").trim());

const toConfidence = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const shortUrl = (value: string) => {
  const safe = String(value || "").trim();
  if (!safe) return "—";
  try {
    const parsed = new URL(safe);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return safe;
  }
};

export default function AgentChatWorkspace({
  agentId,
  agentName,
  avatarUrl,
  initialInput,
  attached = false
}: AgentChatWorkspaceProps) {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saveFilesToKnowledge, setSaveFilesToKnowledge] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const [viewTab, setViewTab] = useState<"chat" | "debug">("chat");
  const [artemMode, setArtemMode] = useState<
    "auto" | "potential_clients" | "hot_signals" | "rank_provided_list"
  >("auto");
  const [artemTarget, setArtemTarget] = useState<"buyer_only" | "competitor_scan">("buyer_only");
  const [artemGeoScope, setArtemGeoScope] = useState<"cis" | "global">("cis");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isArtem = useMemo(() => /арт[её]м|artem/i.test(agentName), [agentName]);

  useEffect(() => {
    if (typeof initialInput === "string" && initialInput.trim()) {
      setInput(initialInput);
    }
  }, [initialInput]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
    [threads]
  );

  const upsertThread = (nextThread: AgentThread) => {
    setThreads((prev) => {
      const rest = prev.filter((thread) => thread.id !== nextThread.id);
      return [nextThread, ...rest];
    });
  };

  const loadThreads = async () => {
    if (!agentId) return;
    setLoadingThreads(true);
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}/threads`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось загрузить историю.");
      }
      const list = Array.isArray(payload?.threads) ? payload.threads : [];
      setThreads(list);
      if (list.length > 0) {
        setActiveThreadId((prev) => prev || list[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки");
    } finally {
      setLoadingThreads(false);
    }
  };

  const loadThread = async (threadId: string) => {
    if (!threadId) {
      setMessages([]);
      return;
    }
    setLoadingThread(true);
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}/thread/${threadId}`, {
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<ThreadPayload> & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось загрузить тред");
      }
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      if (payload?.thread) {
        upsertThread(payload.thread);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки треда");
      setMessages([]);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    loadThreads();
  }, [agentId]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    loadThread(activeThreadId);
  }, [agentId, activeThreadId]);

  const createThread = async () => {
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}/threads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Новый диалог" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось создать тред");
      }
      if (payload?.thread) {
        upsertThread(payload.thread as AgentThread);
        setActiveThreadId(payload.thread.id);
        setMessages([]);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Ошибка создания треда");
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const onAttach = () => {
    fileInputRef.current?.click();
  };

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const submitMessage = async () => {
    const content = input.trim();
    if ((!content && pendingFiles.length === 0) || sending) return;

    setSending(true);
    setTyping(true);
    setError("");

    const optimisticMessage: AgentMessage = {
      id: `temp-${Date.now()}`,
      thread_id: activeThreadId || "temp",
      role: "user",
      content: content || "Файл приложен без текста",
      attachments: pendingFiles.map((file, index) => ({
        id: `temp-file-${index}`,
        filename: file.name,
        mime: file.type,
        size: file.size
      })),
      created_at: new Date().toISOString()
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    if (activeThreadId) {
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId
            ? {
                ...thread,
                last_status: "Running"
              }
            : thread
        )
      );
    }

    const formData = new FormData();
    if (activeThreadId) {
      formData.append("thread_id", activeThreadId);
    }
    formData.append("content", content || "Файл приложен без текста");
    formData.append("save_to_knowledge", pendingFiles.length > 0 && saveFilesToKnowledge ? "1" : "0");
    if (isArtem) {
      formData.append("mode", artemMode);
      formData.append("target", artemTarget);
      formData.append("artem_target", artemTarget);
      formData.append("geo_scope", artemGeoScope);
      formData.append("artem_geo_scope", artemGeoScope);
    }
    for (const file of pendingFiles) {
      formData.append("files", file);
    }

    setInput("");
    setPendingFiles([]);

    try {
      const response = await fetch(`/api/agents/${agentId}/message`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось отправить сообщение");
      }

      if (payload?.thread) {
        upsertThread(payload.thread as AgentThread);
        setActiveThreadId(payload.thread.id);
      } else if (!activeThreadId) {
        setThreads((prev) => [
          {
            id: `temp-thread-${Date.now()}`,
            title: buildThreadTitle(content),
            last_status: "Done",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          ...prev
        ]);
      }

      if (Array.isArray(payload?.messages)) {
        setMessages(payload.messages as AgentMessage[]);
      }

      await loadThreads();
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Ошибка отправки";
      setError(message);
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId
            ? {
                ...thread,
                last_status: "Error"
              }
            : thread
        )
      );
    } finally {
      setTyping(false);
      setSending(false);
    }
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  };

  return (
    <div
      className={
        attached
          ? "flex-1 min-h-0 overflow-hidden bg-white"
          : "h-[calc(100vh-10.5rem)] min-h-[620px] overflow-hidden rounded-3xl border border-slate-200/70 bg-white"
      }
    >
      <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="bg-[#F8F9FF] p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">История</div>
              <div className="mt-1 text-sm font-semibold text-[#1F2238]">Диалоги</div>
            </div>
            <button
              type="button"
              onClick={createThread}
              className="rounded-full bg-[#5C5BD6] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Новый тред
            </button>
          </div>

          <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
            {loadingThreads ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white px-3 py-4 text-xs text-[#5A6072] animate-pulse">
                Загружаем историю...
              </div>
            ) : sortedThreads.length === 0 ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white px-3 py-4 text-xs text-[#5A6072]">
                Пока нет тредов. Начните новый диалог.
              </div>
            ) : (
              sortedThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setActiveThreadId(thread.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    thread.id === activeThreadId
                      ? "border-[#BFC5F4] bg-white shadow-sm"
                      : "border-slate-200/70 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="text-sm font-semibold text-[#1F2238] line-clamp-2">
                    {thread.title}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#5A6072]">
                    <span>{formatDateTime(thread.updated_at)}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${statusClass(thread.last_status)}`}>
                      {statusLabel(thread.last_status)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-white">
          <div className="border-b border-slate-200/70 px-5 py-2">
            <div className="inline-flex rounded-full border border-[#D8DDF7] bg-white p-1">
              <button
                type="button"
                onClick={() => setViewTab("chat")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  viewTab === "chat" ? "bg-[#5C5BD6] text-white" : "text-[#3E3A8C]"
                }`}
              >
                Чат
              </button>
              <button
                type="button"
                onClick={() => setViewTab("debug")}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  viewTab === "debug" ? "bg-[#5C5BD6] text-white" : "text-[#3E3A8C]"
                }`}
              >
                Debug
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 bg-[#FCFCFF]">
            {loadingThread ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#5A6072] animate-pulse">
                Загружаем сообщения...
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-[#5A6072]">
                Напишите задачу агенту или прикрепите файл. История и контекст сохраняются.
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "items-start gap-3 justify-start"}`}
                  >
                    {!isUser ? (
                      avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={agentName}
                          className="h-9 w-9 rounded-2xl border border-slate-200 bg-white object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-xs font-semibold text-[#3E3A8C]">
                          {agentName.slice(0, 1).toUpperCase()}
                        </span>
                      )
                    ) : null}

                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm border ${
                        isUser
                          ? "border-[#4F4EC6] bg-[#5C5BD6] text-white"
                          : "border-slate-200/70 bg-white text-[#1F2238]"
                      }`}
                    >
                      <div className={`text-[11px] font-semibold ${isUser ? "text-white/90" : "text-[#3E3A8C]"}`}>
                        {isUser ? "Вы" : agentName}
                      </div>
                      {!isUser && Array.isArray(message.leads) && message.leads.length > 0 ? (
                        <div className="mt-2 space-y-3">
                          <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                          <div className="text-xs text-[#5A6072]">
                            {message.status_code ? `Статус: ${message.status_code}` : "Результаты поиска лидов"}
                          </div>

                          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
                            <table className="min-w-[1120px] w-full border-collapse text-xs text-[#1F2238]">
                              <thead>
                                <tr className="bg-[#F8F9FF] text-left">
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Rank</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Company/Organization</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Title</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Real URL</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Source</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Evidence</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Why now</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Where to contact</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Confidence</th>
                                  <th className="border-b border-slate-200/70 px-2 py-2 font-semibold">Lead type</th>
                                </tr>
                              </thead>
                              <tbody>
                                {message.leads.map((lead, index) => {
                                  const hasUrl = isHttpUrl(lead.url);
                                  return (
                                    <tr key={`${message.id}-lead-${index}`} className="align-top">
                                      <td className="border-b border-slate-100 px-2 py-2">{lead.rank || index + 1}</td>
                                      <td className="border-b border-slate-100 px-2 py-2">
                                        {lead.company_or_organization || "source post/job/tender"}
                                      </td>
                                      <td className="border-b border-slate-100 px-2 py-2">{lead.title || "Без названия"}</td>
                                      <td className="border-b border-slate-100 px-2 py-2">
                                        {hasUrl ? (
                                          <div className="flex flex-col gap-1">
                                            <a
                                              href={lead.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="text-[#3E3A8C] underline break-all"
                                            >
                                              {shortUrl(lead.url)}
                                            </a>
                                            <a
                                              href={lead.url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-flex w-fit rounded-full border border-[#D8DDF7] px-2 py-1 text-[11px] font-semibold text-[#3E3A8C] hover:bg-[#EEF0FF]"
                                            >
                                              Открыть источник
                                            </a>
                                          </div>
                                        ) : (
                                          <span className="text-[#7A8097]">—</span>
                                        )}
                                      </td>
                                      <td className="border-b border-slate-100 px-2 py-2">{lead.source || "web"}</td>
                                      <td className="border-b border-slate-100 px-2 py-2 whitespace-pre-wrap">
                                        {lead.evidence || lead.snippet || "—"}
                                      </td>
                                      <td className="border-b border-slate-100 px-2 py-2 whitespace-pre-wrap">
                                        {lead.why_now || lead.why_match || "—"}
                                      </td>
                                      <td className="border-b border-slate-100 px-2 py-2 whitespace-pre-wrap">
                                        {lead.where_to_contact || lead.contact_hint || "—"}
                                      </td>
                                      <td className="border-b border-slate-100 px-2 py-2">
                                        {toConfidence(lead.confidence)}
                                      </td>
                                      <td className="border-b border-slate-100 px-2 py-2">
                                        {lead.lead_type || "Warm"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {viewTab === "debug" &&
                          ((Array.isArray(message.search_debug?.queries) &&
                            message.search_debug?.queries.length > 0) ||
                          message.search_debug?.intent_json ||
                          Number.isFinite(Number(message.search_debug?.total_tokens)) ||
                          Boolean(message.search_debug?.llm_not_called) ||
                          (message.search_debug?.models_per_step &&
                            Object.keys(message.search_debug.models_per_step).length > 0)) ? (
                            <details className="rounded-xl border border-slate-200/70 bg-[#FBFBFF] px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold text-[#3E3A8C]">
                                Диагностика поиска
                              </summary>
                              <div className="mt-2 text-xs text-[#5A6072]">
                                <div>
                                  total_tokens:{" "}
                                  {Number.isFinite(Number(message.search_debug?.total_tokens))
                                    ? Number(message.search_debug?.total_tokens)
                                    : 0}
                                </div>
                                {message.search_debug?.web_search ? (
                                  <div>
                                    web_search:{" "}
                                    {message.search_debug.web_search.enabled ? "enabled" : "disabled"} (
                                    {message.search_debug.web_search.reason || "n/a"}, provider=
                                    {message.search_debug.web_search.provider || "n/a"})
                                  </div>
                                ) : null}
                                <div>
                                  geo_scope: {message.search_debug?.geo_scope || "cis"}
                                </div>
                                <div>
                                  geo_drop_count:{" "}
                                  {Number.isFinite(Number(message.search_debug?.geo_drop_count))
                                    ? Number(message.search_debug?.geo_drop_count)
                                    : 0}
                                </div>
                                <div>
                                  search_target:{" "}
                                  {message.search_debug?.search_target || "buyer_only"}
                                </div>
                                <div>
                                  candidates_from_input:{" "}
                                  {Number.isFinite(Number(message.search_debug?.candidates_from_input))
                                    ? Number(message.search_debug?.candidates_from_input)
                                    : 0}
                                </div>
                                <div>
                                  vendor_filtered_count:{" "}
                                  {Number.isFinite(Number(message.search_debug?.vendor_filtered_count))
                                    ? Number(message.search_debug?.vendor_filtered_count)
                                    : 0}
                                </div>
                                <div>
                                  llm_status: {message.search_debug?.llm_not_called ? "LLM not called" : "LLM called"}
                                </div>
                                <div>
                                  Отфильтровано как нерелевантные:{" "}
                                  {Number.isFinite(Number(message.search_debug?.filtered_irrelevant_count))
                                    ? Number(message.search_debug?.filtered_irrelevant_count)
                                    : 0}
                                </div>
                                <div>
                                  Отброшено как статьи/форумы/словари:{" "}
                                  {Number.isFinite(Number(message.search_debug?.dropped_articles_forums))
                                    ? Number(message.search_debug?.dropped_articles_forums)
                                    : 0}
                                </div>
                              </div>
                              {message.search_debug?.models_per_step &&
                              Object.keys(message.search_debug.models_per_step).length > 0 ? (
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-[#3E3A8C]">
                                    Models per step
                                  </div>
                                  <ul className="mt-1 list-disc pl-5 text-xs text-[#5A6072]">
                                    {Object.entries(message.search_debug.models_per_step).map(
                                      ([step, model]) => (
                                        <li key={`${message.id}-model-${step}`}>
                                          {step}: {model}
                                        </li>
                                      )
                                    )}
                                  </ul>
                                </div>
                              ) : null}
                              {message.search_debug?.source_categories &&
                              Object.keys(message.search_debug.source_categories).length > 0 ? (
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-[#3E3A8C]">
                                    Где искал (категории источников)
                                  </div>
                                  <ul className="mt-1 list-disc pl-5 text-xs text-[#5A6072]">
                                    {Object.entries(message.search_debug.source_categories)
                                      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
                                      .map(([kind, count]) => (
                                        <li key={`${message.id}-src-${kind}`}>
                                          {kind}: {Number(count || 0)}
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              ) : null}
                              {message.search_debug?.filtered_reasons &&
                              Object.keys(message.search_debug.filtered_reasons).length > 0 ? (
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-[#3E3A8C]">
                                    Причины отсева
                                  </div>
                                  <ul className="mt-1 list-disc pl-5 text-xs text-[#5A6072]">
                                    {Object.entries(message.search_debug.filtered_reasons)
                                      .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
                                      .map(([reason, count]) => (
                                        <li key={`${message.id}-reason-${reason}`}>
                                          {reason}: {Number(count || 0)}
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              ) : null}
                              {Array.isArray(message.search_debug?.geo_drop_examples) &&
                              message.search_debug.geo_drop_examples.length > 0 ? (
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-[#3E3A8C]">
                                    Outside geo examples
                                  </div>
                                  <ul className="mt-1 list-disc pl-5 text-xs text-[#5A6072]">
                                    {message.search_debug.geo_drop_examples
                                      .map((item, idx) => (
                                        <li key={`${message.id}-geo-drop-${idx}`}>
                                          {item?.domain || "unknown"}: {item?.reason || "outside geo"}
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              ) : null}
                              {message.search_debug?.intent_json ? (
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-[#3E3A8C]">Intent JSON</div>
                                  <div className="mt-1 text-[11px] text-[#5A6072]">
                                    intent: offer=
                                    {Array.isArray((message.search_debug.intent_json as any)?.offer?.keywords)
                                      ? String(
                                          (message.search_debug.intent_json as any).offer.keywords
                                            .join(", ") || "-"
                                        )
                                      : Array.isArray((message.search_debug.intent_json as any)?.flat?.keywords)
                                        ? String(
                                            (message.search_debug.intent_json as any).flat.keywords
                                              .join(", ") || "-"
                                          )
                                      : "-"}
                                    ; icp=
                                    {Array.isArray((message.search_debug.intent_json as any)?.icp?.industries)
                                      ? String(
                                          (message.search_debug.intent_json as any).icp.industries
                                            .join(", ") || "-"
                                        )
                                      : Array.isArray((message.search_debug.intent_json as any)?.flat?.target_customer)
                                        ? String(
                                            (message.search_debug.intent_json as any).flat.target_customer
                                              .join(", ") || "-"
                                          )
                                      : "-"}
                                    ; geo=
                                    {Array.isArray((message.search_debug.intent_json as any)?.icp?.geo)
                                      ? String((message.search_debug.intent_json as any).icp.geo.join(", ") || "-")
                                      : Array.isArray((message.search_debug.intent_json as any)?.flat?.geo)
                                        ? String((message.search_debug.intent_json as any).flat.geo.join(", ") || "-")
                                      : "-"}
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-[#5A6072]">
                                    {JSON.stringify(message.search_debug.intent_json, null, 2)}
                                  </pre>
                                </div>
                              ) : null}
                              {Array.isArray(message.search_debug?.negative_keywords) &&
                              message.search_debug?.negative_keywords.length > 0 ? (
                                <div className="mt-2">
                                  <div className="text-xs font-semibold text-[#3E3A8C]">
                                    Negative keywords
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {message.search_debug?.negative_keywords?.map((keyword, keywordIndex) => (
                                      <span
                                        key={`${message.id}-negative-${keywordIndex}`}
                                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-[#5A6072]"
                                      >
                                        {keyword}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {Array.isArray(message.search_debug?.queries) &&
                              message.search_debug.queries.length > 0 ? (
                                <>
                                  <div className="mt-2 text-xs font-semibold text-[#3E3A8C]">
                                    Queries used
                                  </div>
                                  <ol className="mt-1 list-decimal pl-5 space-y-1 text-xs text-[#5A6072]">
                                    {(message.search_debug?.queries || []).map((query, queryIndex) => (
                                      <li key={`${message.id}-query-${queryIndex}`}>{query}</li>
                                    ))}
                                  </ol>
                                </>
                              ) : null}
                            </details>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1 space-y-2">
                          <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
                          {viewTab === "debug" && !isUser && message.search_debug ? (
                            <details className="rounded-xl border border-slate-200/70 bg-[#FBFBFF] px-3 py-2">
                              <summary className="cursor-pointer text-xs font-semibold text-[#3E3A8C]">
                                Диагностика поиска
                              </summary>
                              <div className="mt-2 text-xs text-[#5A6072]">
                                <div>
                                  web_search:{" "}
                                  {message.search_debug?.web_search?.enabled ? "enabled" : "disabled"} (
                                  {message.search_debug?.web_search?.reason || "n/a"}, provider=
                                  {message.search_debug?.web_search?.provider || "n/a"})
                                </div>
                                <div>
                                  geo_scope: {message.search_debug?.geo_scope || "cis"}
                                </div>
                                <div>
                                  geo_drop_count:{" "}
                                  {Number.isFinite(Number(message.search_debug?.geo_drop_count))
                                    ? Number(message.search_debug?.geo_drop_count)
                                    : 0}
                                </div>
                                <div>
                                  search_target: {message.search_debug?.search_target || "buyer_only"}
                                </div>
                                <div>
                                  candidates_from_input:{" "}
                                  {Number.isFinite(Number(message.search_debug?.candidates_from_input))
                                    ? Number(message.search_debug?.candidates_from_input)
                                    : 0}
                                </div>
                                <div>
                                  vendor_filtered_count:{" "}
                                  {Number.isFinite(Number(message.search_debug?.vendor_filtered_count))
                                    ? Number(message.search_debug?.vendor_filtered_count)
                                    : 0}
                                </div>
                                <div>
                                  total_tokens:{" "}
                                  {Number.isFinite(Number(message.search_debug?.total_tokens))
                                    ? Number(message.search_debug?.total_tokens)
                                    : 0}
                                </div>
                              </div>
                            </details>
                          ) : null}
                        </div>
                      )}

                      {!isUser && message.routing?.out_of_role_but_completed ? (
                        <div className="mt-3 rounded-xl border border-[#D8DDF7] bg-[#F8F9FF] px-3 py-2 text-xs text-[#3E3A8C]">
                          <div>
                            Задача классифицирована как{" "}
                            <span className="font-semibold">
                              {message.routing.requested_task_type || "general_ops"}
                            </span>
                            . Подготовлен рабочий черновик.
                          </div>
                          <div className="mt-1">
                            Рекомендуемый агент:{" "}
                            <span className="font-semibold">
                              {message.routing.recommended_agent_name || "профильный агент"}
                            </span>
                          </div>
                          {message.routing.transfer_available && message.routing.recommended_agent_id ? (
                            <a
                              href={`/agents/${message.routing.recommended_agent_id}`}
                              className="mt-2 inline-flex rounded-full border border-[#BFC5F4] bg-white px-3 py-1 text-xs font-semibold text-[#3E3A8C] hover:bg-[#EEF0FF]"
                            >
                              Передать задачу
                            </a>
                          ) : null}
                        </div>
                      ) : null}

                      {viewTab === "debug" && !isUser && message.routing ? (
                        <details className="mt-3 rounded-xl border border-slate-200/70 bg-[#FBFBFF] px-3 py-2">
                          <summary className="cursor-pointer text-xs font-semibold text-[#3E3A8C]">
                            Routing debug
                          </summary>
                          <div className="mt-2 text-xs text-[#5A6072]">
                            <div>roleKey: {message.routing.role_key || "n/a"}</div>
                            <div>requestedTaskType: {message.routing.requested_task_type || "general_support"}</div>
                            <div>
                              allowedTaskTypes:{" "}
                              {Array.isArray(message.routing.allowed_task_types) &&
                              message.routing.allowed_task_types.length > 0
                                ? message.routing.allowed_task_types.join(", ")
                                : "n/a"}
                            </div>
                          </div>
                        </details>
                      ) : null}

                      {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.attachments.map((attachment, index) => (
                            <span
                              key={`${message.id}-a-${attachment.id || index}`}
                              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                                isUser
                                  ? "border-white/35 bg-white/15 text-white"
                                  : "border-slate-200 bg-[#EEF0FF] text-[#3E3A8C]"
                              }`}
                            >
                              {attachment.filename} · {fileLabel(attachment.size)}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className={`mt-2 text-[10px] ${isUser ? "text-white/70" : "text-[#7A8097]"}`}>
                        {formatDateTime(message.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {typing ? (
              <div className="flex items-start gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={agentName}
                    className="h-9 w-9 rounded-2xl border border-slate-200 bg-white object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-xs font-semibold text-[#3E3A8C]">
                    {agentName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="max-w-[82%] rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
                  <div className="text-[11px] font-semibold text-[#3E3A8C]">{agentName}</div>
                  <div className="mt-1 text-sm text-[#5A6072] animate-pulse">печатает...</div>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="px-4 py-3 bg-white border-t border-slate-200/70">
            {error ? (
              <div className="mb-2 rounded-xl border border-[#F3CCD0] bg-[#FFF1F2] px-3 py-2 text-xs text-[#B42318]">
                {error}
              </div>
            ) : null}

            {pendingFiles.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {pendingFiles.map((file, index) => (
                  <span
                    key={`${file.name}-${index}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-[#EEF0FF] px-2.5 py-1 text-[11px] text-[#3E3A8C]"
                  >
                    <span>{file.name}</span>
                    <span className="text-[#5A6072]">{fileLabel(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(index)}
                      className="text-[#4E4FE0]"
                      aria-label={`Удалить файл ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {isArtem ? (
              <div className="mb-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setArtemMode("potential_clients");
                      if (!input.trim()) {
                        setInput("Сгенерируй список потенциальных клиентов под мой продукт.");
                      }
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      artemMode === "potential_clients"
                        ? "border-[#5C5BD6] bg-[#EEF0FF] text-[#3E3A8C]"
                        : "border-slate-200 bg-white text-[#5A6072] hover:bg-[#F8F9FF]"
                    }`}
                  >
                    Сгенерировать список потенциальных клиентов
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setArtemMode("hot_signals");
                      if (!input.trim()) {
                        setInput("Найти горячие сигналы в интернете по моему запросу.");
                      }
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      artemMode === "hot_signals"
                        ? "border-[#5C5BD6] bg-[#EEF0FF] text-[#3E3A8C]"
                        : "border-slate-200 bg-white text-[#5A6072] hover:bg-[#F8F9FF]"
                    }`}
                  >
                    Найти горячие сигналы в интернете
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setArtemGeoScope("cis")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      artemGeoScope === "cis"
                        ? "border-[#5C5BD6] bg-[#EEF0FF] text-[#3E3A8C]"
                        : "border-slate-200 bg-white text-[#5A6072] hover:bg-[#F8F9FF]"
                    }`}
                  >
                    Гео: СНГ
                  </button>
                  <button
                    type="button"
                    onClick={() => setArtemGeoScope("global")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      artemGeoScope === "global"
                        ? "border-[#5C5BD6] bg-[#EEF0FF] text-[#3E3A8C]"
                        : "border-slate-200 bg-white text-[#5A6072] hover:bg-[#F8F9FF]"
                    }`}
                  >
                    Гео: Глобально
                  </button>
                </div>
                <div className="text-[11px] text-[#7A8097]">
                  Активно: {artemGeoScope === "global" ? "Глобально" : "СНГ"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setArtemTarget("buyer_only")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      artemTarget === "buyer_only"
                        ? "border-[#5C5BD6] bg-[#EEF0FF] text-[#3E3A8C]"
                        : "border-slate-200 bg-white text-[#5A6072] hover:bg-[#F8F9FF]"
                    }`}
                  >
                    Искать клиентов
                  </button>
                  <button
                    type="button"
                    onClick={() => setArtemTarget("competitor_scan")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      artemTarget === "competitor_scan"
                        ? "border-[#5C5BD6] bg-[#EEF0FF] text-[#3E3A8C]"
                        : "border-slate-200 bg-white text-[#5A6072] hover:bg-[#F8F9FF]"
                    }`}
                  >
                    Искать конкурентов
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={onAttach}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#3E3A8C] hover:bg-[#F8F9FF]"
                aria-label="Прикрепить файл"
              >
                +
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={onSelectFiles}
                className="hidden"
                accept=".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg,.json,.md"
              />

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onTextareaKeyDown}
                placeholder={`Опишите задачу для ${agentName}. Enter — отправить, Shift+Enter — новая строка`}
                rows={2}
                disabled={sending}
                className="min-h-[44px] max-h-48 flex-1 resize-y rounded-2xl border border-slate-200/70 px-4 py-2 text-sm text-[#1F2238] outline-none focus:border-[#5C5BD6] focus:ring-2 focus:ring-[#5C5BD6]/20 disabled:bg-slate-100"
              />

              <button
                type="button"
                onClick={submitMessage}
                disabled={sending || (!input.trim() && pendingFiles.length === 0)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#5C5BD6] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(92,91,214,0.3)] transition hover:bg-[#4F4EC6] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Отправка..." : "Отправить"}
              </button>
            </div>

            <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-[#7A8097]">
              <input
                type="checkbox"
                checked={saveFilesToKnowledge}
                onChange={(event) => setSaveFilesToKnowledge(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              Добавлять прикреплённые файлы в базу знаний агента
            </label>
          </footer>
        </section>
      </div>
    </div>
  );
}
