const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../prisma.js");
const { runOrchestrator } = require("../orchestrator.js");
const { retrieveKnowledge } = require("../knowledge/retrieval.js");
const { ensureBoardAgentsForWorkspace } = require("./agentSync.js");
const { buildSearchText, estimateTokens, hashContent } = require("../../utils/knowledge.js");

const BOARD_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "board");
const MAX_EXTRACTED_TEXT = 50000;
const MAX_ATTACHMENT_SNIPPET = 900;
const MAX_CONTEXT_MESSAGES = 8;

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

const ensureBoardStorageReady = () => {
  const hasDelegates = Boolean(
    prisma &&
      prisma.boardThread &&
      prisma.boardMessage &&
      prisma.boardAttachment
  );
  if (hasDelegates) return;

  const error = new Error(
    "Board storage is not initialized. Run: npx prisma generate && npx prisma db push, then restart dev server."
  );
  error.status = 503;
  throw error;
};

const toText = (value) => (typeof value === "string" ? value : "");

const sanitizeText = (value, maxChars = MAX_EXTRACTED_TEXT) =>
  toText(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxChars);

const sanitizeFileName = (value) => {
  const base = path.basename(toText(value) || "file");
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "file";
};

const extensionFromName = (value) => path.extname(toText(value)).toLowerCase();

const toKb = (bytes) => {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${Math.round(numeric / 1024)} KB`;
  return `${(numeric / (1024 * 1024)).toFixed(1)} MB`;
};

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const roleLabel = (role) => {
  if (role === "user") return "Пользователь";
  if (role === "ceo") return "Антон CEO";
  if (role === "cto") return "Юрий CTO";
  if (role === "cfo") return "София CFO";
  if (role === "chair") return "Илья Chairman";
  return role;
};

const ensureList = (value, minItems, fallbackPrefix) => {
  const source = Array.isArray(value)
    ? value.map((item) => sanitizeText(item, 240)).filter(Boolean)
    : [];
  const result = [...source];
  while (result.length < minItems) {
    result.push(`${fallbackPrefix} ${result.length + 1}`);
  }
  return result.slice(0, Math.max(minItems, source.length));
};

const deriveQuestions = (facts, fallbackPrefix) => {
  const list = Array.isArray(facts)
    ? facts.map((item) => sanitizeText(item, 140)).filter(Boolean)
    : [];
  const generated = list.slice(0, 3).map((item) => `Что докажет, что ${item.toLowerCase()}?`);
  return ensureList(generated, 3, fallbackPrefix).slice(0, 3);
};

const deriveRisks = (facts, fallbackPrefix) => {
  const list = Array.isArray(facts)
    ? facts.map((item) => sanitizeText(item, 160)).filter(Boolean)
    : [];
  return ensureList(list, 3, fallbackPrefix).slice(0, 3);
};

const buildThreadTitle = (content) => {
  const words = sanitizeText(content, 400).split(/\s+/).filter(Boolean);
  return words.slice(0, 8).join(" ") || "Новое совещание";
};

const deriveConstraintsFromText = (content) => {
  const source = sanitizeText(content, 2500);
  if (!source) return "";

  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const picked = lines.filter((line) =>
    /^(огранич|бюджет|срок|ресурс)/i.test(line)
  );

  if (picked.length > 0) {
    return sanitizeText(picked.join("; "), 1000);
  }

  const inlineMatch = source.match(
    /(ограничения?|бюджет|сроки?|ресурсы?)[:\-]\s*([^\n.]{5,240})/i
  );
  if (inlineMatch && inlineMatch[2]) {
    return sanitizeText(inlineMatch[2], 1000);
  }
  return "";
};

const summarizeAttachment = (attachment) => {
  const base = `${attachment.filename} (${attachment.mime || "unknown"}, ${toKb(attachment.size)})`;
  if (attachment.extractedText) {
    const snippet = sanitizeText(attachment.extractedText, MAX_ATTACHMENT_SNIPPET).replace(/\n+/g, " ");
    return `${base}: ${snippet}`;
  }
  if (String(attachment.mime || "").startsWith("image/")) {
    return `${base}: image attached`;
  }
  return `${base}: available to review`;
};

const buildAttachmentSummary = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  return attachments.slice(0, 8).map((item, index) => `${index + 1}. ${summarizeAttachment(item)}`).join("\n");
};

const ensureKnowledgeLink = async ({
  workspaceId,
  knowledgeId,
  scope = "workspace",
  agentId = null
}) => {
  const normalizedAgentId = scope === "agent" ? agentId : null;
  try {
    return await prisma.knowledgeLink.create({
      data: {
        workspaceId,
        knowledgeId,
        agentId: normalizedAgentId,
        scope
      }
    });
  } catch {
    return prisma.knowledgeLink.findFirst({
      where: {
        workspaceId,
        knowledgeId,
        agentId: normalizedAgentId,
        scope
      }
    });
  }
};

const ingestAttachmentsToKnowledge = async ({
  workspaceId,
  attachments,
  scope = "workspace"
}) => {
  if (!Array.isArray(attachments) || attachments.length === 0) return { added: 0 };

  let added = 0;
  for (const attachment of attachments) {
    const title = sanitizeText(attachment.filename, 220) || "Файл";
    const extractedText = sanitizeText(
      attachment.extractedText || attachment.extracted_text || "",
      MAX_EXTRACTED_TEXT
    );
    const fallbackContent = `Файл: ${title}. Тип: ${attachment.mime || "unknown"}. Размер: ${toKb(attachment.size)}.`;
    const content = extractedText || fallbackContent;
    const sourceUrl =
      sanitizeText(attachment.storagePath || attachment.storage_path || "", 500) || title;
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
      scope,
      agentId: null
    });
    added += 1;
  }

  return { added };
};

const buildContextFromMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const tail = messages.slice(-MAX_CONTEXT_MESSAGES);
  const lines = [];
  for (const message of tail) {
    const content = sanitizeText(message.content, 600);
    if (!content) continue;
    lines.push(`${roleLabel(message.role)}: ${content}`);
  }
  return lines.join("\n");
};

const mapAttachment = (item) => ({
  id: item.id,
  thread_id: item.threadId,
  message_id: item.messageId,
  filename: item.filename,
  mime: item.mime,
  size: item.size,
  storage_path: item.storagePath,
  extracted_text: item.extractedText || null,
  created_at: item.createdAt
});

const mapMessage = (item) => {
  const chips = parseJsonArray(item.attachmentsJson);
  const fallback = Array.isArray(item.attachments)
    ? item.attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mime: attachment.mime,
        size: attachment.size
      }))
    : [];

  return {
    id: item.id,
    thread_id: item.threadId,
    role: item.role,
    content: item.content,
    attachments: chips.length > 0 ? chips : fallback,
    created_at: item.createdAt
  };
};

const mapThread = (item) => ({
  id: item.id,
  workspace_id: item.workspaceId,
  title: item.title,
  last_status: item.lastStatus,
  created_at: item.createdAt,
  updated_at: item.updatedAt
});

const ensureThread = async ({ workspaceId, threadId }) => {
  const thread = await prisma.boardThread.findFirst({
    where: {
      id: threadId,
      workspaceId
    }
  });
  if (!thread) {
    const error = new Error("Thread not found");
    error.status = 404;
    throw error;
  }
  return thread;
};

const isSupportedAttachment = (filename) => SUPPORTED_EXTENSIONS.has(extensionFromName(filename));

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

const persistAttachment = async ({ threadId, messageId, file }) => {
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

  const dir = path.join(BOARD_UPLOAD_ROOT, threadId);
  await fs.mkdir(dir, { recursive: true });
  const storageName = `${Date.now()}-${randomUUID().slice(0, 8)}-${filename}`;
  const absolutePath = path.join(dir, storageName);
  await fs.writeFile(absolutePath, sourceBuffer);

  let extractedText = null;
  if (isTextAttachment(filename, mime)) {
    extractedText = sanitizeText(sourceBuffer.toString("utf8"), MAX_EXTRACTED_TEXT) || null;
  }

  const created = await prisma.boardAttachment.create({
    data: {
      threadId,
      messageId,
      filename,
      mime,
      size: safeSize,
      storagePath: toRelativeStoragePath(absolutePath),
      extractedText
    }
  });

  return created;
};

const formatBoardRoleMessage = (role, review) => {
  const safe = review && typeof review === "object" ? review : {};

  if (role === "ceo") {
    const stance = sanitizeText(safe.stance || "условно_за", 60);
    const verdict = sanitizeText(safe.verdict || "Нужен тест гипотезы.", 700);
    const nextActions = ensureList(safe.next_actions, 3, "Действие");
    const questions = ensureList(
      safe.uncomfortable_questions || deriveQuestions(safe.key_arguments, "Неудобный вопрос"),
      3,
      "Неудобный вопрос"
    ).slice(0, 3);
    const risks = ensureList(
      safe.risks || deriveRisks(safe.key_arguments, "Риск"),
      3,
      "Риск"
    ).slice(0, 3);

    return [
      `Позиция: ${stance}.`,
      `Что делать: ${verdict}`,
      "",
      "3 неудобных вопроса:",
      ...questions.map((item) => `- ${item}`),
      "",
      "3 риска:",
      ...risks.map((item) => `- ${item}`),
      "",
      "Что делать прямо сейчас:",
      ...nextActions.slice(0, 3).map((item) => `- ${item}`)
    ].join("\n");
  }

  if (role === "cto") {
    const feasibility = sanitizeText(safe.feasibility || "средняя", 80);
    const verdict = sanitizeText(safe.verdict || "Реализация требует проверки ограничений.", 700);
    const questions = ensureList(
      safe.uncomfortable_questions || deriveQuestions(safe.dependencies, "Неудобный вопрос"),
      3,
      "Неудобный вопрос"
    ).slice(0, 3);
    const risks = ensureList(
      safe.implementation_risks || safe.risks,
      3,
      "Тех-риск"
    ).slice(0, 3);
    const plan = ensureList(safe.execution_plan, 3, "Шаг").slice(0, 3);

    return [
      `Позиция: ${feasibility}.`,
      `Что делать: ${verdict}`,
      "",
      "3 неудобных вопроса:",
      ...questions.map((item) => `- ${item}`),
      "",
      "3 риска:",
      ...risks.map((item) => `- ${item}`),
      "",
      "Первые шаги реализации:",
      ...plan.map((item) => `- ${item}`)
    ].join("\n");
  }

  if (role === "cfo") {
    const recommendation = sanitizeText(safe.recommendation || "условно_за", 80);
    const economics = sanitizeText(safe.unit_economics_view || "Экономика не подтверждена.", 700);
    const questions = ensureList(
      safe.uncomfortable_questions || deriveQuestions(safe.financial_risks, "Неудобный вопрос"),
      3,
      "Неудобный вопрос"
    ).slice(0, 3);
    const risks = ensureList(
      safe.financial_risks || safe.risks,
      3,
      "Финансовый риск"
    ).slice(0, 3);
    const guardrails = ensureList(safe.budget_guardrails, 3, "Ограничение бюджета").slice(0, 3);

    return [
      `Позиция: ${recommendation}.`,
      `Что делать: ${economics}`,
      "",
      "3 неудобных вопроса:",
      ...questions.map((item) => `- ${item}`),
      "",
      "3 риска:",
      ...risks.map((item) => `- ${item}`),
      "",
      "Бюджетные рамки:",
      ...guardrails.map((item) => `- ${item}`)
    ].join("\n");
  }

  const rawDecision = sanitizeText(safe.decision || "HOLD", 80).toUpperCase();
  const decision =
    rawDecision === "GO"
      ? "ДА"
      : rawDecision === "NO_GO"
        ? "НЕТ"
        : "СНАЧАЛА ПРОВЕРИТЬ X";
  const finalSummary = sanitizeText(safe.final_summary || "Данных недостаточно для финального GO.", 700);
  const plan = ensureList(safe.seven_day_plan, 7, "День").slice(0, 7);
  const metrics = ensureList(safe.metrics_to_track, 3, "Метрика").slice(0, 5);

  return [
    `Коротко по спору: ${finalSummary}`,
    `Финальное решение: ${decision}`,
    "",
    "План на 7 дней:",
    ...plan.map((item) => `- ${item}`),
    "",
    "Что измерять:",
    ...metrics.map((item) => `- ${item}`)
  ].join("\n");
};

const buildRoleMessages = (final) => {
  const safeFinal = final && typeof final === "object" ? final : {};
  const order = [
    { role: "ceo", payload: safeFinal.ceo },
    { role: "cto", payload: safeFinal.cto },
    { role: "cfo", payload: safeFinal.cfo },
    { role: "chair", payload: safeFinal.chairman }
  ];

  return order.map((item) => {
    const hasPayload = item.payload && typeof item.payload === "object" && Object.keys(item.payload).length > 0;
    if (!hasPayload) {
      return {
        role: item.role,
        isError: true,
        content:
          "Ошибка: позиция не была сформирована. Что сделать: перезапустите совещание и проверьте входные данные."
      };
    }
    return {
      role: item.role,
      isError: false,
      content: formatBoardRoleMessage(item.role, item.payload)
    };
  });
};

const createBoardThread = async ({ workspaceId, title }) => {
  ensureBoardStorageReady();
  await ensureBoardAgentsForWorkspace({ workspaceId });
  const safeTitle = sanitizeText(title || "", 180) || "Новое совещание";
  const created = await prisma.boardThread.create({
    data: {
      workspaceId,
      title: safeTitle,
      lastStatus: "Done"
    }
  });
  return mapThread(created);
};

const listBoardThreads = async ({ workspaceId }) => {
  ensureBoardStorageReady();
  await ensureBoardAgentsForWorkspace({ workspaceId });
  const threads = await prisma.boardThread.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" }
  });
  return threads.map((item) => mapThread(item));
};

const getBoardThread = async ({ workspaceId, threadId }) => {
  ensureBoardStorageReady();
  await ensureBoardAgentsForWorkspace({ workspaceId });
  const thread = await prisma.boardThread.findFirst({
    where: {
      id: threadId,
      workspaceId
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: {
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!thread) return null;

  return {
    thread: mapThread(thread),
    messages: thread.messages.map((item) => mapMessage(item))
  };
};

const runBoardForThread = async ({
  workspaceId,
  threadId,
  userMessageId,
  goal,
  constraints,
  context,
  attachmentsSummary
}) => {
  await ensureBoardAgentsForWorkspace({ workspaceId });
  const thread = await prisma.boardThread.findFirst({
    where: {
      id: threadId,
      workspaceId
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          attachments: true
        }
      }
    }
  });

  if (!thread) {
    const error = new Error("Thread not found");
    error.status = 404;
    throw error;
  }

  const latestUserMessage =
    thread.messages.find((message) => message.id === userMessageId && message.role === "user") ||
    [...thread.messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage) {
    const error = new Error("No user message found for thread");
    error.status = 400;
    throw error;
  }

  const threadContext = buildContextFromMessages(thread.messages);
  const messageAttachments = Array.isArray(latestUserMessage.attachments)
    ? latestUserMessage.attachments
    : [];
  const attachmentContext = attachmentsSummary || buildAttachmentSummary(messageAttachments);
  const mergedContext = [sanitizeText(context, 2500), threadContext, attachmentContext]
    .filter(Boolean)
    .join("\n\n");

  const boardInput = {
    idea: sanitizeText(latestUserMessage.content, 3000),
    goal: sanitizeText(goal, 50) || "рост",
    constraints:
      sanitizeText(constraints, 1000) ||
      deriveConstraintsFromText(latestUserMessage.content),
    context: mergedContext,
    critique_level: "жёстко",
    critique_mode: "hard_truth",
    attachments_summary: attachmentContext
  };

  const knowledgeQuery = sanitizeText(
    [
      boardInput.idea,
      boardInput.goal,
      boardInput.constraints,
      boardInput.context,
      boardInput.attachments_summary
    ]
      .filter(Boolean)
      .join("\n"),
    4000
  );

  let knowledgeContext = "";
  if (knowledgeQuery) {
    try {
      const retrieval = await retrieveKnowledge({
        workspaceId,
        query: knowledgeQuery,
        topK: 5
      });
      knowledgeContext = sanitizeText(retrieval?.context || "", 4000);
    } catch {
      knowledgeContext = "";
    }
  }

  if (knowledgeContext) {
    boardInput.context = [boardInput.context, knowledgeContext].filter(Boolean).join("\n\n");
  }

  let orchestratorResult;
  let roleMessages = [];
  let status = "Done";
  let errorText = "";

  try {
    orchestratorResult = await runOrchestrator({
      goal: "board_review",
      inputs: {
        board: boardInput
      },
      budget: {
        max_words: 900
      }
    });
    roleMessages = buildRoleMessages(orchestratorResult?.data?.final);
    if (roleMessages.some((item) => item.isError)) {
      status = "Error";
    }
  } catch (error) {
    status = "Error";
    errorText = error instanceof Error ? error.message : "Unknown error";
    roleMessages = [
      {
        role: "chair",
        isError: true,
        content:
          "Ошибка запуска совещания. Что сделать: проверьте входные данные и повторите запуск."
      }
    ];
  }

  const createdMessages = [];
  for (const item of roleMessages) {
    const created = await prisma.boardMessage.create({
      data: {
        threadId: thread.id,
        role: item.role,
        content: item.content,
        attachmentsJson: "[]"
      }
    });
    createdMessages.push(created);
  }

  await prisma.boardThread.update({
    where: { id: thread.id },
    data: {
      lastStatus: status
    }
  });

  return {
    ok: status !== "Error",
    status,
    error: errorText || null,
    orchestrator: orchestratorResult || null,
    messages: createdMessages.map((item) => mapMessage(item))
  };
};

const createBoardMessageAndRun = async ({
  workspaceId,
  threadId,
  content,
  files,
  goal,
  constraints,
  context,
  saveToKnowledge
}) => {
  ensureBoardStorageReady();
  await ensureBoardAgentsForWorkspace({ workspaceId });
  const safeContent = sanitizeText(content, 4000);
  if (!safeContent) {
    const error = new Error("Message content is required");
    error.status = 400;
    throw error;
  }

  const fileList = Array.isArray(files) ? files : [];
  const ownerThread = threadId
    ? await ensureThread({ workspaceId, threadId })
    : await prisma.boardThread.create({
        data: {
          workspaceId,
          title: buildThreadTitle(safeContent),
          lastStatus: "Running"
        }
      });

  if (threadId) {
    await prisma.boardThread.update({
      where: { id: ownerThread.id },
      data: {
        lastStatus: "Running",
        title:
          sanitizeText(ownerThread.title, 180) ||
          buildThreadTitle(safeContent)
      }
    });
  }

  const userMessage = await prisma.boardMessage.create({
    data: {
      threadId: ownerThread.id,
      role: "user",
      content: safeContent,
      attachmentsJson: "[]"
    }
  });

  const createdAttachments = [];
  for (const file of fileList) {
    const attachment = await persistAttachment({
      threadId: ownerThread.id,
      messageId: userMessage.id,
      file
    });
    createdAttachments.push(attachment);
  }

  const chips = createdAttachments.map((item) => ({
    id: item.id,
    filename: item.filename,
    mime: item.mime,
    size: item.size
  }));

  if (chips.length > 0) {
    await prisma.boardMessage.update({
      where: { id: userMessage.id },
      data: {
        attachmentsJson: JSON.stringify(chips)
      }
    });
  }

  if (Boolean(saveToKnowledge) && createdAttachments.length > 0) {
    try {
      await ingestAttachmentsToKnowledge({
        workspaceId,
        attachments: createdAttachments,
        scope: "workspace"
      });
    } catch {
      // Keep board flow resilient even if knowledge ingestion fails.
    }
  }

  const runResult = await runBoardForThread({
    workspaceId,
    threadId: ownerThread.id,
    userMessageId: userMessage.id,
    goal,
    constraints,
    context,
    attachmentsSummary: buildAttachmentSummary(createdAttachments)
  });

  const latestThread = await getBoardThread({
    workspaceId,
    threadId: ownerThread.id
  });

  return {
    thread: latestThread?.thread || mapThread(ownerThread),
    messages: latestThread?.messages || [],
    run: runResult
  };
};

const rerunBoardThread = async ({ workspaceId, threadId, goal, constraints, context }) => {
  ensureBoardStorageReady();
  await ensureBoardAgentsForWorkspace({ workspaceId });
  await ensureThread({ workspaceId, threadId });
  await prisma.boardThread.update({
    where: { id: threadId },
    data: { lastStatus: "Running" }
  });
  const runResult = await runBoardForThread({
    workspaceId,
    threadId,
    goal,
    constraints,
    context
  });
  const latestThread = await getBoardThread({ workspaceId, threadId });
  return {
    thread: latestThread?.thread || null,
    messages: latestThread?.messages || [],
    run: runResult
  };
};

module.exports = {
  BOARD_UPLOAD_ROOT,
  MAX_EXTRACTED_TEXT,
  buildThreadTitle,
  createBoardThread,
  listBoardThreads,
  getBoardThread,
  createBoardMessageAndRun,
  rerunBoardThread,
  runBoardForThread,
  sanitizeText
};
