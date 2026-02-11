const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../prisma.js");
const { WebClient } = require("./webClient.js");
const { runAgentWithKnowledge } = require("../knowledge/runWithKnowledge.js");
const { getHandoffTypeForAgent } = require("../../utils/handoff.js");
const { getRunnerByRegistryId, listAgentRunners } = require("./runnerRegistry.js");
const { buildSearchText, estimateTokens, hashContent } = require("../../utils/knowledge.js");

const THREAD_MODE = "agent_chat";
const MAX_CONTEXT_MESSAGES = 8;
const MAX_ASSISTANT_CHARS = 12000;
const MAX_EXTRACTED_TEXT = 50000;
const MAX_ATTACHMENT_SNIPPET = 900;
const AGENT_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "agents");

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".csv",
  ".png",
  ".jpg",
  ".jpeg",
  ".json",
  ".md"
]);

const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".json", ".md"]);

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const sanitizeText = (value, maxChars = 8000) =>
  toText(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxChars);

const parseJsonObject = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const buildThreadTitle = (content) => {
  const words = sanitizeText(content, 400).split(/\s+/).filter(Boolean);
  return words.slice(0, 8).join(" ") || "Новый диалог";
};

const mapThreadStatus = (status) => {
  const safe = toText(status).toLowerCase();
  if (safe === "running" || safe === "queued") return "Running";
  if (safe === "error" || safe === "failed") return "Error";
  return "Done";
};

const toKb = (bytes) => {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${Math.round(numeric / 1024)} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
};

const mapThread = (task) => ({
  id: task.id,
  title: task.title || "Новый диалог",
  last_status: mapThreadStatus(task.status),
  created_at: task.createdAt,
  updated_at: task.updatedAt
});

const toClientAttachment = (attachment) => ({
  id: toText(attachment.id) || randomUUID(),
  filename: sanitizeText(attachment.filename, 240) || "file",
  mime: sanitizeText(attachment.mime, 120) || "application/octet-stream",
  size: Number(attachment.size || 0)
});

const mapMessage = (message) => {
  const meta = parseJsonObject(message.meta);
  const attachments = Array.isArray(meta.attachments)
    ? meta.attachments.map(toClientAttachment)
    : [];
  return {
    id: message.id,
    thread_id: message.taskId,
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
    attachments,
    created_at: message.createdAt
  };
};

const ensureAgent = async ({ workspaceId, agentId }) => {
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId: workspaceId }
  });
  if (!agent) {
    const error = new Error("Agent not found");
    error.status = 404;
    throw error;
  }
  return agent;
};

const ensureThread = async ({ workspaceId, agentId, threadId }) => {
  const task = await prisma.task.findFirst({
    where: {
      id: threadId,
      userId: workspaceId,
      selectedAgentId: agentId,
      mode: THREAD_MODE
    }
  });
  if (!task) {
    const error = new Error("Thread not found");
    error.status = 404;
    throw error;
  }
  return task;
};

const listAgentThreads = async ({ workspaceId, agentId }) => {
  await ensureAgent({ workspaceId, agentId });
  const tasks = await prisma.task.findMany({
    where: {
      userId: workspaceId,
      selectedAgentId: agentId,
      mode: THREAD_MODE
    },
    orderBy: { updatedAt: "desc" }
  });
  return tasks.map(mapThread);
};

const createAgentThread = async ({ workspaceId, agentId, title }) => {
  await ensureAgent({ workspaceId, agentId });
  const safeTitle = sanitizeText(title, 180) || "Новый диалог";
  const created = await prisma.task.create({
    data: {
      userId: workspaceId,
      title: safeTitle,
      inputText: "",
      mode: THREAD_MODE,
      selectedAgentId: agentId,
      status: "success"
    }
  });
  return mapThread(created);
};

const getAgentThread = async ({ workspaceId, agentId, threadId }) => {
  await ensureAgent({ workspaceId, agentId });
  const task = await prisma.task.findFirst({
    where: {
      id: threadId,
      userId: workspaceId,
      selectedAgentId: agentId,
      mode: THREAD_MODE
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!task) return null;

  const messages = task.messages
    .filter((message) => message.role === "user" || message.role === "agent")
    .map(mapMessage);

  return {
    thread: mapThread(task),
    messages
  };
};

const buildBaseInput = (text, toolsEnabled) => ({
  mode: "quick",
  language: "ru",
  input_text: text,
  prompt: text,
  task: text,
  has_web_access: toolsEnabled,
  max_web_requests: toolsEnabled ? 5 : 0
});

const buildAgentInput = (key, text, toolsEnabled) => {
  const base = buildBaseInput(text, toolsEnabled);
  switch (key) {
    case "platon":
      return { ...base, industry_or_niche: text, geo: "" };
    case "maxim":
      return { ...base, query: text, geo: "" };
    case "fedor-b2b-leads-ru":
      return { ...base, industries: [text], geo: "Россия" };
    case "artem-hot-leads-ru":
      return { ...base, keywords: [text], geo: "Россия" };
    case "anatoly":
      return { ...base, company_name: text };
    case "timofey-competitor-analysis-ru":
      return { ...base, competitors: [text], focus: text };
    case "leonid-outreach-dm-ru":
      return { ...base, lead_label: text };
    case "emelyan-cold-email-ru":
      return { ...base, lead_label: text };
    case "boris-bdr-operator-ru":
      return { ...base, lead_label: text };
    case "pavel-reels-analysis-ru":
      return { ...base, input_content: { outline: text } };
    case "trofim-shorts-analogs-ru":
      return { ...base, niche: text, references: { themes: [text] } };
    case "irina-content-ideation-ru":
      return { ...base, niche: text };
    case "hariton-viral-hooks-ru":
      return { ...base, niche: text, offer: { one_liner: text } };
    case "kostya-image-generation-ru":
      return { ...base, niche: text, content_inputs: { headline: text } };
    case "seva-content-repurposing-ru":
      return { ...base, source_asset: { text } };
    case "mitya-workflow-diagram-ru":
      return { ...base, context: { product_one_liner: text } };
    default:
      return base;
  }
};

const resolveRunnerKeyFromAgentName = (agentName) => {
  const name = toText(agentName).toLowerCase();
  if (!name) return null;

  if (name.includes("платон")) return "platon";
  if (name.includes("мария") || name.includes("анатол")) return "anatoly";
  if (name.includes("тимоф")) return "timofey-competitor-analysis-ru";
  if (name.includes("максим")) return "maxim";
  if (name.includes("фёдор") || name.includes("федор")) return "fedor-b2b-leads-ru";
  if (name.includes("артём") || name.includes("артем")) return "artem-hot-leads-ru";
  if (name.includes("леонид")) return "leonid-outreach-dm-ru";
  if (name.includes("емель")) return "emelyan-cold-email-ru";
  if (name.includes("борис")) return "boris-bdr-operator-ru";
  if (name.includes("павел")) return "pavel-reels-analysis-ru";
  if (name.includes("трофим")) return "trofim-shorts-analogs-ru";
  if (name.includes("ирина")) return "irina-content-ideation-ru";
  if (name.includes("харит")) return "hariton-viral-hooks-ru";
  if (name.includes("костя")) return "kostya-image-generation-ru";
  if (name.includes("сева")) return "seva-content-repurposing-ru";
  if (name.includes("анастас") || name.includes("митя")) return "mitya-workflow-diagram-ru";

  const byLeadToken = listAgentRunners().find((runner) => {
    const leadToken = toText(runner.displayName)
      .split(/[\s—-]+/)
      .filter(Boolean)[0]
      ?.toLowerCase();
    return leadToken && name.includes(leadToken);
  });
  return byLeadToken ? byLeadToken.registryId : null;
};

const buildDialogueContext = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const tail = messages.slice(-MAX_CONTEXT_MESSAGES);
  const lines = tail
    .map((message) => {
      const role = message.role === "user" ? "Пользователь" : "Агент";
      const content = sanitizeText(message.content, 500);
      if (!content) return "";
      return `${role}: ${content}`;
    })
    .filter(Boolean);
  return lines.join("\n");
};

const formatOutput = (output) => {
  const payload =
    output && typeof output === "object" && output.data
      ? output.data
      : output;
  if (typeof payload === "string") {
    return sanitizeText(payload, MAX_ASSISTANT_CHARS);
  }
  let asJson = "";
  try {
    asJson = JSON.stringify(payload ?? {}, null, 2);
  } catch {
    asJson = String(payload ?? "");
  }
  if (asJson.length <= MAX_ASSISTANT_CHARS) return asJson;
  return `${asJson.slice(0, MAX_ASSISTANT_CHARS)}\n...`;
};

const sanitizeFileName = (value) => {
  const base = path.basename(toText(value) || "file");
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "file";
};

const extensionFromName = (value) => path.extname(toText(value)).toLowerCase();

const isSupportedAttachment = (filename) =>
  SUPPORTED_EXTENSIONS.has(extensionFromName(filename));

const isTextAttachment = (filename, mime) => {
  const ext = extensionFromName(filename);
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (String(mime || "").startsWith("text/")) return true;
  return String(mime || "").includes("json");
};

const toRelativeStoragePath = (absolutePath) => {
  const relative = path.relative(process.cwd(), absolutePath);
  return relative.split(path.sep).join("/");
};

const persistAgentAttachment = async ({ threadId, file }) => {
  const filename = sanitizeFileName(file.filename || "file");
  const mime = sanitizeText(file.mime || "application/octet-stream", 120) || "application/octet-stream";
  const size = Number(file.size || 0);
  const extension = extensionFromName(filename);

  if (!isSupportedAttachment(filename)) {
    const error = new Error(`Unsupported attachment type: ${extension || filename}`);
    error.status = 400;
    throw error;
  }

  const sourceBuffer = Buffer.isBuffer(file.buffer)
    ? file.buffer
    : Buffer.from(file.buffer || file.text || "", "utf8");
  const safeSize = Number.isFinite(size) && size > 0 ? size : sourceBuffer.length;

  const dir = path.join(AGENT_UPLOAD_ROOT, threadId);
  await fs.mkdir(dir, { recursive: true });
  const storageName = `${Date.now()}-${randomUUID().slice(0, 8)}-${filename}`;
  const absolutePath = path.join(dir, storageName);
  await fs.writeFile(absolutePath, sourceBuffer);

  let extractedText = null;
  if (isTextAttachment(filename, mime)) {
    extractedText = sanitizeText(sourceBuffer.toString("utf8"), MAX_EXTRACTED_TEXT) || null;
  }

  return {
    id: randomUUID(),
    filename,
    mime,
    size: safeSize,
    storage_path: toRelativeStoragePath(absolutePath),
    extracted_text: extractedText
  };
};

const buildAttachmentSummary = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  return attachments
    .slice(0, 8)
    .map((item, index) => {
      const base = `${index + 1}. ${item.filename} (${item.mime || "unknown"}, ${toKb(item.size)})`;
      if (item.extracted_text) {
        const snippet = sanitizeText(item.extracted_text, MAX_ATTACHMENT_SNIPPET).replace(/\n+/g, " ");
        return `${base}: ${snippet}`;
      }
      if (String(item.mime || "").startsWith("image/")) {
        return `${base}: image attached`;
      }
      return `${base}: available to review`;
    })
    .join("\n");
};

const ensureKnowledgeLink = async ({
  workspaceId,
  knowledgeId,
  agentId,
  scope
}) => {
  try {
    return await prisma.knowledgeLink.create({
      data: {
        workspaceId,
        knowledgeId,
        agentId: scope === "agent" ? agentId : null,
        scope
      }
    });
  } catch {
    return prisma.knowledgeLink.findFirst({
      where: {
        workspaceId,
        knowledgeId,
        agentId: scope === "agent" ? agentId : null,
        scope
      }
    });
  }
};

const ingestAttachmentsToKnowledge = async ({
  workspaceId,
  agentId,
  attachments,
  scope = "agent"
}) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return { added: 0 };

  let added = 0;
  for (const attachment of attachments) {
    const title = sanitizeText(attachment.filename, 220) || "Файл";
    const fallbackContent = `Файл: ${title}. Тип: ${attachment.mime || "unknown"}. Размер: ${toKb(attachment.size)}.`;
    const content = sanitizeText(attachment.extracted_text || fallbackContent, MAX_EXTRACTED_TEXT);
    const sourceUrl = sanitizeText(attachment.storage_path, 500) || title;
    const searchText = buildSearchText(title, content);
    const contentHash = hashContent(content);
    const tokensCountEstimate = estimateTokens(searchText);

    let knowledgeItem = await prisma.knowledgeItem.findFirst({
      where: {
        workspaceId,
        contentHash,
        sourceUrl
      }
    });

    if (!knowledgeItem) {
      knowledgeItem = await prisma.knowledgeItem.create({
        data: {
          workspaceId,
          title,
          sourceType: "file",
          sourceUrl,
          contentText: content,
          contentHash,
          tokensCountEstimate,
          searchText
        }
      });
    }

    await ensureKnowledgeLink({
      workspaceId,
      knowledgeId: knowledgeItem.id,
      agentId,
      scope
    });
    added += 1;
  }

  return { added };
};

const runAgentReply = async ({
  runnerKey,
  text,
  toolsEnabled,
  knowledgeEnabled,
  workspaceId,
  knowledgeAgentId
}) => {
  const runner = getRunnerByRegistryId(runnerKey);
  if (!runner) {
    const error = new Error("Runner not found");
    error.status = 400;
    throw error;
  }

  const input = buildAgentInput(runnerKey, text, toolsEnabled);
  const webClient = runner.isWeb && toolsEnabled ? new WebClient({ maxRequests: 5 }) : null;
  const runFn = (payload) => runner.run(payload, { webClient });

  if (knowledgeEnabled) {
    const knowledgeRun = await runAgentWithKnowledge({
      agentId: knowledgeAgentId || runner.agentId,
      systemPrompt: runner.systemPrompt,
      input,
      runner: runFn,
      workspaceId,
      handoffType: getHandoffTypeForAgent(runner.agentId)
    });
    const result = knowledgeRun?.result;
    return result && result.output ? result.output : result;
  }

  const direct = await runFn(input);
  return direct && direct.output ? direct.output : direct;
};

const createAgentMessageAndRun = async ({
  workspaceId,
  agentId,
  threadId,
  content,
  files,
  saveToKnowledge
}) => {
  const agent = await ensureAgent({ workspaceId, agentId });
  const safeContent = sanitizeText(content, 4000);
  if (!safeContent) {
    const error = new Error("Message content is required");
    error.status = 400;
    throw error;
  }

  const thread = threadId
    ? await ensureThread({ workspaceId, agentId, threadId })
    : await prisma.task.create({
        data: {
          userId: workspaceId,
          title: buildThreadTitle(safeContent),
          inputText: safeContent,
          mode: THREAD_MODE,
          selectedAgentId: agentId,
          status: "running"
        }
      });

  await prisma.task.update({
    where: { id: thread.id },
    data: {
      status: "running",
      title: sanitizeText(thread.title, 180) || buildThreadTitle(safeContent),
      inputText: safeContent,
      errorText: null
    }
  });

  const userMessage = await prisma.taskMessage.create({
    data: {
      taskId: thread.id,
      userId: workspaceId,
      role: "user",
      content: safeContent,
      meta: "{}"
    }
  });

  const fileList = Array.isArray(files) ? files : [];
  const createdAttachments = [];
  for (const file of fileList) {
    const attachment = await persistAgentAttachment({
      threadId: thread.id,
      file
    });
    createdAttachments.push(attachment);
  }

  if (createdAttachments.length > 0) {
    await prisma.taskMessage.update({
      where: { id: userMessage.id },
      data: {
        meta: JSON.stringify({
          attachments: createdAttachments
        })
      }
    });
  }

  const allMessages = await prisma.taskMessage.findMany({
    where: { taskId: thread.id, userId: workspaceId },
    orderBy: { createdAt: "asc" }
  });
  const chatMessages = allMessages
    .filter((message) => message.role === "user" || message.role === "agent")
    .map((message) => {
      const meta = parseJsonObject(message.meta);
      const attachmentText = Array.isArray(meta.attachments)
        ? buildAttachmentSummary(meta.attachments)
        : "";
      return {
        role: message.role === "user" ? "user" : "assistant",
        content: [message.content, attachmentText].filter(Boolean).join("\n")
      };
    });

  const contextText = buildDialogueContext(chatMessages.slice(0, -1));
  const currentAttachmentSummary = buildAttachmentSummary(createdAttachments);
  const textForRun = [
    safeContent,
    contextText ? `Контекст диалога:\n${contextText}` : "",
    currentAttachmentSummary ? `Вложения пользователя:\n${currentAttachmentSummary}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");

  const runnerKey = resolveRunnerKeyFromAgentName(agent.name);
  const toolsEnabled = true;
  const knowledgeEnabled = true;

  let assistantContent = "";
  let status = "success";
  let errorText = null;

  if (!runnerKey) {
    status = "error";
    errorText = "Runner is not configured for this agent.";
    assistantContent =
      "Ошибка: для этого агента пока не настроен раннер. Что сделать: проверьте имя агента и сопоставление в chat runtime.";
  } else {
    try {
      const output = await runAgentReply({
        runnerKey,
        text: textForRun,
        toolsEnabled,
        knowledgeEnabled,
        workspaceId,
        knowledgeAgentId: agent.id
      });
      assistantContent = formatOutput(output);
      if (!assistantContent) {
        assistantContent = "Готово. Ответ сформирован без текста.";
      }
    } catch (error) {
      status = "error";
      errorText = error instanceof Error ? error.message : "Unknown error";
      assistantContent = `Ошибка: ${errorText}`;
    }
  }

  let knowledgeAdded = 0;
  if (Boolean(saveToKnowledge) && createdAttachments.length > 0) {
    try {
      const ingestion = await ingestAttachmentsToKnowledge({
        workspaceId,
        agentId: agent.id,
        attachments: createdAttachments,
        scope: "agent"
      });
      knowledgeAdded = Number(ingestion?.added || 0);
    } catch {
      knowledgeAdded = 0;
    }
  }

  await prisma.taskMessage.create({
    data: {
      taskId: thread.id,
      userId: workspaceId,
      role: "agent",
      agentId,
      content: assistantContent,
      meta:
        knowledgeAdded > 0
          ? JSON.stringify({ knowledge_added: knowledgeAdded })
          : "{}"
    }
  });

  await prisma.task.update({
    where: { id: thread.id },
    data: {
      status,
      errorText,
      outputSummary: assistantContent.slice(0, 600)
    }
  });

  const latestThread = await getAgentThread({
    workspaceId,
    agentId,
    threadId: thread.id
  });

  return {
    thread: latestThread?.thread || mapThread(thread),
    messages: latestThread?.messages || []
  };
};

module.exports = {
  THREAD_MODE,
  buildThreadTitle,
  listAgentThreads,
  createAgentThread,
  getAgentThread,
  createAgentMessageAndRun,
  resolveRunnerKeyFromAgentName
};
