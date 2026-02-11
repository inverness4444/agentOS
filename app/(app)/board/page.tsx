"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { buildParticipantCards } from "@/lib/board/participants.js";

type ThreadStatus = "Done" | "Running" | "Error";

type BoardThread = {
  id: string;
  title: string;
  last_status: ThreadStatus;
  created_at: string;
  updated_at: string;
};

type BoardAttachment = {
  id?: string;
  filename: string;
  mime: string;
  size: number;
};

type BoardMessage = {
  id: string;
  thread_id: string;
  role: "user" | "ceo" | "cto" | "cfo" | "chair";
  content: string;
  attachments?: BoardAttachment[];
  created_at: string;
};

type ThreadPayload = {
  thread: BoardThread;
  messages: BoardMessage[];
};

type TypingRole = "ceo" | "cto" | "cfo" | "chair";

const roleMeta: Record<Exclude<BoardMessage["role"], "user">, { name: string; avatar?: string }> = {
  ceo: {
    name: "Антон CEO",
    avatar: "/photo/8a186648-572d-4d2a-965a-e10ae360280c.png"
  },
  cto: {
    name: "Юрий CTO",
    avatar: "/photo/spyFMGSBExjfd4fOzn0ckfPti5Q.avif"
  },
  cfo: {
    name: "София CFO",
    avatar: "/photo/jXydvuTthAcDkmDxdHNzRy2PTd0-alt.avif"
  },
  chair: {
    name: "Илья Chairman",
    avatar: "/photo/bbe52a9c-94b7-4ca6-88c7-d8d2ac7e92d5.png"
  }
};

const typingOrder: TypingRole[] = ["ceo", "cto", "cfo", "chair"];

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

const participantStatusClass = (status: string) => {
  if (status === "Готово") {
    return "border-[#CBEFD7] bg-[#F0FFF5] text-[#1E7A3D]";
  }
  if (status === "В процессе") {
    return "border-[#D8DDF7] bg-[#EEF0FF] text-[#3E3A8C]";
  }
  if (status === "Ошибка") {
    return "border-[#F3CCD0] bg-[#FFF1F2] text-[#B42318]";
  }
  return "border-[#D8DDF7] bg-[#F8F9FF] text-[#3E3A8C]";
};

const buildThreadTitle = (value: string) => {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 8).join(" ") || "Новое совещание";
};

const fileLabel = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function BoardPage() {
  const [hydrated, setHydrated] = useState(false);
  const [threads, setThreads] = useState<BoardThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState("");
  const [messages, setMessages] = useState<BoardMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saveFilesToKnowledge, setSaveFilesToKnowledge] = useState(true);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingRoles, setTypingRoles] = useState<TypingRole[]>([]);
  const [error, setError] = useState("");
  const [runError, setRunError] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
    [threads]
  );

  const activeThread = useMemo(
    () => sortedThreads.find((thread) => thread.id === activeThreadId) || null,
    [sortedThreads, activeThreadId]
  );

  const participantCards = useMemo(
    () => buildParticipantCards(messages, { sending, runError }),
    [messages, sending, runError]
  );

  const scrollToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingRoles]);

  const upsertThread = (nextThread: BoardThread) => {
    setThreads((prev) => {
      const rest = prev.filter((thread) => thread.id !== nextThread.id);
      return [nextThread, ...rest];
    });
  };

  const loadThreads = async () => {
    setLoadingThreads(true);
    setError("");
    setRunError("");
    try {
      const response = await fetch("/api/board/threads", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось загрузить историю совещаний.");
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
      setRunError("");
      return;
    }

    setLoadingThread(true);
    setError("");
    setRunError("");
    setMessages([]);
    try {
      const response = await fetch(`/api/board/thread/${threadId}`, { cache: "no-store" });
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
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    if (activeThreadId) {
      loadThread(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId]);

  const createThread = async () => {
    setError("");
    setRunError("");
    try {
      const response = await fetch("/api/board/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Новое совещание" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось создать тред");
      }

      if (payload?.thread) {
        upsertThread(payload.thread);
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
    if (!content && pendingFiles.length === 0) return;
    if (sending) return;

    setError("");
    setRunError("");
    setSending(true);
    setTypingRoles(typingOrder);

    const optimisticMessage: BoardMessage = {
      id: `temp-${Date.now()}`,
      thread_id: activeThreadId || "temp",
      role: "user",
      content,
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
    for (const file of pendingFiles) {
      formData.append("files", file);
    }

    setInput("");
    setPendingFiles([]);

    try {
      const response = await fetch("/api/board/message", {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Не удалось отправить сообщение");
      }

      if (payload?.thread) {
        upsertThread(payload.thread as BoardThread);
        setActiveThreadId(payload.thread.id);
      } else if (!activeThreadId) {
        const fallbackTitle = buildThreadTitle(content);
        setThreads((prev) => [
          {
            id: `temp-thread-${Date.now()}`,
            title: fallbackTitle,
            last_status: "Done",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          ...prev
        ]);
      }

      if (Array.isArray(payload?.messages)) {
        setMessages(payload.messages as BoardMessage[]);
      }

      await loadThreads();
      setRunError("");
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Ошибка отправки";
      setError(message);
      setRunError(message);
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
      setTypingRoles([]);
      setSending(false);
    }
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  };

  const scrollToRoleMessage = (role: TypingRole) => {
    const card = participantCards.find((item) => item.role === role);
    const messageId = String(card?.last_message_id || "");
    if (!messageId) return;
    const target = document.getElementById(`board-message-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!hydrated) {
    return (
      <div className="h-[calc(100vh-1rem)] min-h-[680px] bg-white overflow-hidden">
        <div className="h-full rounded-3xl border border-slate-200/70 bg-white p-6">
          <div className="h-6 w-56 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-1rem)] min-h-[680px] bg-white overflow-hidden">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="bg-[#F8F9FF] p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">История</div>
              <div className="mt-1 text-sm font-semibold text-[#1F2238]">Совещания</div>
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
                  <div className="text-sm font-semibold text-[#1F2238] line-clamp-2">{thread.title}</div>
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
          <header className="px-5 py-4">
            <div className="text-lg font-semibold text-[#1F2238]">Совет директоров</div>
            <div className="mt-1 text-xs text-[#5A6072]">жёстко и по делу</div>
          </header>

          <div className="px-5 py-3 bg-white">
            <div className="mb-2 text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Участники</div>
            <div className="flex flex-wrap gap-3">
              {participantCards.map((card) => (
                <button
                  key={card.role}
                  type="button"
                  onClick={() => scrollToRoleMessage(card.role as TypingRole)}
                  className="group min-w-[240px] flex-1 rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300/80 focus:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      {roleMeta[card.role as TypingRole]?.avatar ? (
                        <img
                          src={roleMeta[card.role as TypingRole].avatar}
                          alt={roleMeta[card.role as TypingRole].name}
                          className="h-9 w-9 rounded-2xl border border-slate-200 bg-white object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-xs font-semibold text-[#3E3A8C]">
                          {card.initial}
                        </span>
                      )}
                      <div>
                        <div className="text-xs font-semibold text-[#1F2238]">{card.title}</div>
                        <div className="mt-0.5 text-[11px] text-[#5A6072]">{card.description}</div>
                      </div>
                    </div>
                  </div>

                  {card.updated_at || card.status !== "Нет данных" ? (
                    <div
                      className={`mt-3 flex items-center gap-2 text-[11px] ${
                        card.updated_at ? "justify-between" : "justify-end"
                      }`}
                    >
                      {card.updated_at ? (
                        <span className="text-[#5A6072]">Обновлён {formatDateTime(card.updated_at)}</span>
                      ) : null}
                      {card.status !== "Нет данных" ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 font-semibold ${participantStatusClass(
                            card.status
                          )}`}
                        >
                          {card.status}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {card.error ? (
                    <div className="mt-1 text-[11px] text-[#B42318] line-clamp-1">{card.error}</div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 bg-[#FCFCFF]">
            {loadingThread ? (
              <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#5A6072] animate-pulse">
                Загружаем сообщения...
              </div>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-[#5A6072]">
                Напишите идею или проблему. После отправки Совет запустится автоматически.
              </div>
            ) : (
              messages.map((message) => {
                const isUser = message.role === "user";
                const meta =
                  !isUser && message.role in roleMeta
                    ? roleMeta[message.role as keyof typeof roleMeta]
                    : null;
                return (
                  <div
                    key={message.id}
                    id={`board-message-${message.id}`}
                    className={`flex ${isUser ? "justify-end" : "items-start gap-3 justify-start"}`}
                  >
                    {!isUser ? (
                      meta?.avatar ? (
                        <img
                          src={meta.avatar}
                          alt={meta.name}
                          className="h-9 w-9 rounded-2xl border border-slate-200 bg-white object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-xs font-semibold text-[#3E3A8C]">
                          {meta?.name?.slice(0, 1) || "A"}
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
                        {isUser ? "Вы" : meta?.name}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.content}</div>

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

            {typingRoles.map((role) => {
              const meta = roleMeta[role];
              return (
                <div key={`typing-${role}`} className="flex items-start gap-3">
                  {meta.avatar ? (
                    <img
                      src={meta.avatar}
                      alt={meta.name}
                      className="h-9 w-9 rounded-2xl border border-slate-200 bg-white object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-[#EEF0FF] text-xs font-semibold text-[#3E3A8C]">
                      {meta.name.slice(0, 1)}
                    </span>
                  )}
                  <div className="max-w-[82%] rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-sm">
                    <div className="text-[11px] font-semibold text-[#3E3A8C]">{meta.name}</div>
                    <div className="mt-1 text-sm text-[#5A6072] animate-pulse">печатает...</div>
                  </div>
                </div>
              );
            })}
          </div>

          <footer className="px-4 py-3 bg-white">
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
                placeholder="Опишите идею или проблему. Enter — отправить, Shift+Enter — новая строка"
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
              Добавлять прикреплённые файлы в базу знаний
            </label>

            <div className="mt-2 text-[11px] text-[#7A8097]">
              Режим критики по умолчанию: hard_truth. Прямо, критично, без воды.
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
