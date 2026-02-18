const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../prisma.js");
const { WebClient, canonicalizeUrl } = require("./webClient.js");
const { runAgentWithKnowledge } = require("../knowledge/runWithKnowledge.js");
const { getHandoffTypeForAgent } = require("../../utils/handoff.js");
const { getRunnerByRegistryId, listAgentRunners } = require("./runnerRegistry.js");
const { buildSearchText, estimateTokens, hashContent } = require("../../utils/knowledge.js");
const { searchWeb, SearchProviderError } = require("../search/service.js");
const {
  detectTaskType,
  buildRoutingDecision,
  applyRoleLockToInput,
  buildRoleLockFromAgent
} = require("./taskRouting.js");
const {
  resolveAgentRole,
  isLikelyUserRequestText
} = require("./rolePolicy.js");

const THREAD_MODE = "agent_chat";
const MAX_CONTEXT_MESSAGES = 8;
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
  const leads = Array.isArray(meta.leads)
    ? meta.leads
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const searchDebug =
    meta.search_debug && typeof meta.search_debug === "object" ? meta.search_debug : null;
  const routing =
    meta.routing && typeof meta.routing === "object"
      ? {
          role_key: sanitizeText(meta.routing.role_key, 80),
          allowed_task_types: Array.isArray(meta.routing.allowed_task_types)
            ? meta.routing.allowed_task_types.map((item) => sanitizeText(item, 80)).filter(Boolean)
            : [],
          requested_task_type: sanitizeText(meta.routing.requested_task_type, 80),
          out_of_role_but_completed: Boolean(meta.routing.out_of_role_but_completed),
          recommended_runner_key: sanitizeText(meta.routing.recommended_runner_key, 80),
          recommended_agent_name: sanitizeText(meta.routing.recommended_agent_name, 180),
          recommended_agent_id: sanitizeText(meta.routing.recommended_agent_id, 180),
          transfer_available: Boolean(meta.routing.transfer_available)
        }
      : null;
  const statusCode = sanitizeText(meta.status_code, 80);
  const role = message.role === "user" ? "user" : "assistant";
  const content = role === "assistant" ? clampAssistantText(message.content) : message.content;
  return {
    id: message.id,
    thread_id: message.taskId,
    role,
    content,
    attachments,
    leads,
    search_debug: searchDebug,
    routing,
    status_code: statusCode || undefined,
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
  max_web_requests: toolsEnabled ? null : 0
});

const AGENT_KEYWORD_STOPWORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "для",
  "с",
  "со",
  "к",
  "ко",
  "у",
  "о",
  "об",
  "про",
  "это",
  "эта",
  "этот",
  "мой",
  "моя",
  "мое",
  "мои",
  "мне",
  "нам",
  "вы",
  "мы",
  "они",
  "она",
  "он",
  "как",
  "чтобы",
  "чтоб",
  "или",
  "а",
  "но",
  "да",
  "нет",
  "нужно",
  "надо",
  "сделай",
  "сделать",
  "помоги",
  "помогите",
  "помочь",
  "почему",
  "промт",
  "prompt",
  "агент",
  "агента",
  "найди",
  "найти",
  "пожалуйста",
  "site"
]);

const extractArtemKeywords = (text) => {
  const source = sanitizeText(text, 1500).toLowerCase();
  if (!source) return [];

  const keywords = [];
  const seen = new Set();

  const pushKeyword = (value) => {
    const normalized = sanitizeText(String(value || "").toLowerCase(), 80)
      .replace(/^www\./, "")
      .replace(/^https?:\/\//, "")
      .replace(/[^\p{L}\p{N}._-]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;
    if (AGENT_KEYWORD_STOPWORDS.has(normalized)) return;
    if (normalized.length < 3 || normalized.length > 50) return;
    if (/^\d+$/.test(normalized)) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    keywords.push(normalized);
  };

  const domainRegex = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  for (const match of source.matchAll(domainRegex)) {
    pushKeyword(match[1]);
  }

  const phraseHints = [
    "wb",
    "wildberries",
    "ozon",
    "маркетплейс",
    "чат-бот",
    "чатбот",
    "crm",
    "bitrix",
    "битрикс",
    "amocrm",
    "лидоген",
    "автоматизация",
    "интеграция",
    "реклама",
    "директ"
  ];
  phraseHints.forEach((hint) => {
    if (source.includes(hint)) pushKeyword(hint);
  });

  source
    .replace(/[^\p{L}\p{N}._-]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      if (token.includes(".")) return;
      if (token.length < 4) return;
      if (AGENT_KEYWORD_STOPWORDS.has(token)) return;
      pushKeyword(token);
    });

  return keywords.slice(0, 4);
};

const extractPrimaryPromptForAgent = (text) => {
  const source = sanitizeText(text, 2500);
  if (!source) return "";
  const cutByContext = source.split(/\n\nКонтекст диалога:/i)[0] || source;
  const cutByAttachments = cutByContext.split(/\n\nВложения пользователя:/i)[0] || cutByContext;
  return sanitizeText(cutByAttachments, 1500);
};

const URL_WITH_PROTOCOL_REGEX = /https?:\/\/[^\s)>"'`]+/gi;
const DOMAIN_LIKE_REGEX = /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,})+\b/gi;
const URL_WITH_PROTOCOL_SINGLE_REGEX = /https?:\/\/[^\s)>"'`]+/i;
const DOMAIN_LIKE_SINGLE_REGEX = /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,})+\b/i;
const INVALID_TLD_HINTS = new Set(["html", "htm", "php", "asp", "aspx", "js", "css", "json", "xml", "txt"]);
const USER_FACING_INTERNAL_KEYS = new Set([
  "meta",
  "web_stats",
  "trace_summary",
  "warnings",
  "top_errors",
  "proof_refs",
  "related_proofs",
  "why_here_proof_refs",
  "proof_items",
  "seed_urls",
  "requests_made",
  "blocked_count",
  "errors_count",
  "duration_ms",
  "generated_at",
  "trace_id",
  "run_id",
  "validation",
  "input_echo",
  "knowledge_used",
  "budget_applied",
  "handoff"
]);

const normalizeUrlFromText = (value) => {
  const raw = sanitizeText(String(value || ""), 500)
    .replace(/[),.;!?]+$/g, "")
    .trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^www\./i, "")}`;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    if (labels.length < 2) return "";
    const tld = labels[labels.length - 1] || "";
    if (!/^[a-z]{2,24}$/i.test(tld)) return "";
    if (INVALID_TLD_HINTS.has(tld.toLowerCase())) return "";
    parsed.protocol = "https:";
    parsed.hostname = host;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const extractUrlsFromText = (text) => {
  const source = sanitizeText(text, 4000);
  if (!source) return [];
  const seen = new Set();
  const result = [];

  const push = (raw) => {
    const normalized = normalizeUrlFromText(raw);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  for (const match of source.matchAll(URL_WITH_PROTOCOL_REGEX)) {
    push(match[0]);
  }
  for (const match of source.matchAll(DOMAIN_LIKE_REGEX)) {
    push(match[0]);
  }

  return result;
};

const deriveCompanyNameFromUrl = (url) => {
  const safeUrl = normalizeUrlFromText(url);
  if (!safeUrl) return "";
  try {
    const host = new URL(safeUrl).hostname.replace(/^www\./, "");
    const root = host.split(".").slice(0, -1).join(".") || host;
    const cleaned = root
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "";
    return cleaned
      .split(" ")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
      .join(" ")
      .trim();
  } catch {
    return "";
  }
};

const getDomainFromUrl = (url) => {
  try {
    return new URL(String(url || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const isSameDomainOrSubdomain = (url, baseDomain) => {
  if (!url || !baseDomain) return false;
  const domain = getDomainFromUrl(url);
  if (!domain) return false;
  return domain === baseDomain || domain.endsWith(`.${baseDomain}`);
};

const extractCompanyContextFromPrompt = (text) => {
  const prompt = sanitizeText(text, 2000);
  const urls = extractUrlsFromText(prompt);
  const website = urls[0] || "";
  const derivedName = deriveCompanyNameFromUrl(website);
  return {
    companyWebsite: website,
    companyName: derivedName
  };
};

const normalizeArtemMode = (value) => {
  const safe = sanitizeText(value, 80).toLowerCase();
  if (
    safe === "auto" ||
    safe === "potential_clients" ||
    safe === "hot_signals" ||
    safe === "rank_provided_list"
  ) {
    return safe;
  }
  return "auto";
};

const normalizeArtemTarget = (value) => {
  const safe = sanitizeText(value, 80).toLowerCase();
  if (safe === "competitor_scan") return "competitor_scan";
  return "buyer_only";
};

const normalizeArtemGeoScope = (value) => {
  const safe = sanitizeText(value, 80).toLowerCase();
  if (safe === "global") return "global";
  return "cis";
};

const buildAgentInput = (key, text, toolsEnabled, options = {}) => {
  const base = buildBaseInput(text, toolsEnabled);
  const requestedTaskType = sanitizeText(options.requestedTaskType, 80).toLowerCase() || "general_ops";
  const routingHint =
    options.routingDecision && typeof options.routingDecision === "object"
      ? {
          requested_task_type: requestedTaskType,
          out_of_role: Boolean(options.routingDecision.outOfRole),
          recommended_runner_key: sanitizeText(options.routingDecision.recommendedRunnerKey, 80)
        }
      : null;
  switch (key) {
    case "platon":
      return { ...base, industry_or_niche: text, geo: "" };
    case "maxim":
      return { ...base, query: text, geo: "" };
    case "fedor-b2b-leads-ru":
      return { ...base, industries: [text], geo: "Россия" };
    case "artem-hot-leads-ru": {
      const primaryPrompt = extractPrimaryPromptForAgent(text);
      return {
        ...base,
        query_text: primaryPrompt || text,
        keywords: extractArtemKeywords(primaryPrompt || text),
        geo: "",
        raw_text: sanitizeText(text, 6000),
        workflow_mode: normalizeArtemMode(options.mode),
        search_target: normalizeArtemTarget(options.target),
        geo_scope: normalizeArtemGeoScope(options.geoScope)
      };
    }
    case "anatoly":
      {
        const primaryPrompt = extractPrimaryPromptForAgent(text);
        const companyContext = extractCompanyContextFromPrompt(primaryPrompt || text);
        return {
          ...base,
          company_name: companyContext.companyName,
          company_domain_or_url: companyContext.companyWebsite,
          raw_text: sanitizeText(text, 6000)
        };
      }
    case "timofey-competitor-analysis-ru":
      return { ...base, competitors: [text], focus: text };
    case "leonid-outreach-dm-ru":
      return { ...base, lead_label: text, task_type_requested: requestedTaskType };
    case "emelyan-cold-email-ru":
      {
        const primaryPrompt = extractPrimaryPromptForAgent(text);
        return {
          ...base,
          lead_label: primaryPrompt || text,
          query_text: primaryPrompt || text,
          raw_text: sanitizeText(text, 6000),
          task_type_requested: requestedTaskType,
          routing_hint: routingHint
        };
      }
    case "boris-bdr-operator-ru":
      return { ...base, lead_label: text, task_type_requested: requestedTaskType };
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

const buildRoutingRuntime = async ({ workspaceId, runnerKey, taskType, mode, userText, agent }) => {
  const basePolicy = buildRoleLockFromAgent({ agent, runnerKey });
  const decision = buildRoutingDecision({
    runnerKey,
    taskType,
    mode,
    userText,
    agentPolicy: basePolicy
  });
  if (!decision.recommendedRoleKey) {
    return { decision, recommended: null };
  }

  const recommendedAgent = await prisma.agent.findFirst({
    where: {
      userId: workspaceId,
      roleKey: decision.recommendedRoleKey
    },
    select: {
      id: true,
      name: true,
      roleKey: true,
      allowedTaskTypes: true,
      defaultMode: true,
      webBudget: true,
      maxOutputItems: true,
      escalationPolicy: true
    }
  });

  const recommendedRunnerKey = recommendedAgent
    ? resolveRunnerKeyFromAgentName(recommendedAgent.name)
    : decision.recommendedRunnerKey;
  const recommendedRunner = recommendedRunnerKey
    ? getRunnerByRegistryId(recommendedRunnerKey)
    : decision.recommendedRunnerKey
      ? getRunnerByRegistryId(decision.recommendedRunnerKey)
      : null;

  if (!recommendedRunnerKey || !recommendedRunner) {
    return { decision, recommended: null };
  }

  const recommendedPolicy = buildRoleLockFromAgent({
    agent: recommendedAgent,
    runnerKey: recommendedRunnerKey
  });
  const recommendedDecision = buildRoutingDecision({
    runnerKey: recommendedRunnerKey,
    taskType,
    mode,
    userText,
    agentPolicy: recommendedPolicy
  });

  return {
    decision,
    recommended: {
      roleKey: decision.recommendedRoleKey,
      runnerKey: recommendedRunner.registryId,
      runnerDisplayName: recommendedRunner.displayName,
      agentId: recommendedAgent?.id || "",
      agentName: recommendedAgent?.name || recommendedRunner.displayName,
      decision: recommendedDecision
    }
  };
};

const OUTREACH_BLOCKER_PATTERN = /нужны\s+данные|нет\s+данных|пришли\s+json/i;

const shortDraftFromPrompt = (taskType, userPrompt) => {
  const brief = sanitizeText(userPrompt, 220);
  if (taskType === "outreach_copy" || taskType === "outreach_sequence" || taskType === "pitch_text") {
    return [
      "Тема: Короткий вопрос по инвестициям",
      "Прехедер: 30 секунд, как сократить риск решения.",
      "",
      `Здравствуйте! Увидел ваш фокус: ${brief || "инвестиции и рост"}.`,
      "Предлагаю короткий тестовый формат: 1 гипотеза, 1 метрика, 7 дней на проверку.",
      "Если метрика не растёт, останавливаемся без лишних затрат.",
      "",
      "CTA: Подходит 10-минутный слот на этой неделе?"
    ].join("\n");
  }
  if (taskType === "company_analysis") {
    return [
      `Черновик: начну с аудита сайта ${extractFirstUrlRaw(brief) || "компании"} по 5 блокам: оффер, ICP, CTA, доверие, контакты.`,
      "Выход: краткий список рисков + 3 быстрых правки воронки."
    ].join("\n");
  }
  if (taskType === "competitor_search_fast") {
    return [
      "Черновик: соберу 5–8 прямых конкурентов и для каждого дам 1 строку «почему конкурент».",
      "Без батлкарда и без глубокого скрейпа в fast-режиме."
    ].join("\n");
  }
  if (taskType === "lead_scoring") {
    return [
      "Черновик: приоритизирую лиды по confidence 0–100, why now и следующему действию.",
      "Фокус на топ-10, без длинного списка."
    ].join("\n");
  }
  return `Черновик: ${brief || "задача принята"}, подготовлю короткий практический вариант без лишней теории.`;
};

const buildOutOfRoleUserResponse = ({ agentName, decision, requestedTaskType, recommended, userPrompt }) => {
  const safeAgent = sanitizeOutputText(agentName || "Агент");
  const recommendedName =
    sanitizeOutputText(recommended?.agentName || recommended?.runnerDisplayName || "") ||
    "подходящий профильный агент";
  const draft = shortDraftFromPrompt(requestedTaskType, userPrompt);
  const lines = [
    `Это не моя роль: ${safeAgent} не выполняет задачи типа ${sanitizeOutputText(requestedTaskType || "general_support")}.`,
    `Переключаю на ${recommendedName}.`,
    "",
    `Черновик на сейчас: ${sanitizeOutputText(draft, 1000)}`
  ];
  return sanitizeOutputText(lines.join("\n"), 2400);
};

const applyOutputItemGuards = ({ output, taskType }) => {
  if (!output || typeof output !== "object") return output;
  const payload = output.data && typeof output.data === "object" ? output.data : output;
  if (!payload || typeof payload !== "object") return output;

  const next = { ...payload };
  if (taskType === "competitor_search_fast" && Array.isArray(next.competitors)) {
    next.competitors = next.competitors.slice(0, 8);
  }
  if (taskType === "lead_scoring" && Array.isArray(next.hot_leads)) {
    next.hot_leads = next.hot_leads.slice(0, 30);
  }
  if (taskType === "icp_research" && Array.isArray(next.segments)) {
    next.segments = next.segments.slice(0, 20);
  }

  if (output.data && typeof output.data === "object") {
    return { ...output, data: next };
  }
  return next;
};

const validateRoleLockedOutput = ({ taskType, output, userPrompt }) => {
  const payload = output && typeof output === "object" && output.data ? output.data : output;
  if (!payload || typeof payload !== "object") {
    return { ok: true, errors: [] };
  }
  const errors = [];

  if (taskType === "competitor_search_fast") {
    const competitors = Array.isArray(payload.competitors) ? payload.competitors : [];
    const blacklist = /(wikipedia\.org|wiki|forum|reddit\.com|quora\.com|zhihu\.com|chatroulette|youtube\.com|\.gov\b|gov\.)/i;
    if (competitors.length > 8) {
      errors.push("competitors_over_limit");
    }
    competitors.forEach((item, index) => {
      const url = sanitizeText(item?.primary_url || item?.url || "", 500);
      if (url && blacklist.test(url)) {
        errors.push(`blacklist_domain_${index + 1}`);
      }
      const why =
        sanitizeText(item?.why_competitor || "", 400) ||
        sanitizeText(Array.isArray(item?.promises) ? item.promises.join("; ") : "", 400) ||
        sanitizeText(item?.summary || "", 400);
      if (!why) {
        errors.push(`missing_why_competitor_${index + 1}`);
      }
    });
  }

  if (taskType === "company_analysis") {
    const companyUrl = extractFirstUrlRaw(userPrompt);
    const targetDomain = getDomainFromUrl(normalizeUrlFromText(companyUrl));
    const proofItems = Array.isArray(payload?.meta?.proof_items) ? payload.meta.proof_items : [];
    const official = new Set(
      Array.isArray(payload?.meta?.official_channels)
        ? payload.meta.official_channels.map((item) => normalizeUrlFromText(item)).filter(Boolean)
        : []
    );
    if (targetDomain) {
      for (const item of proofItems) {
        const url = normalizeUrlFromText(item?.url);
        if (!url) continue;
        if (!isSameDomainOrSubdomain(url, targetDomain) && !official.has(url)) {
          errors.push("foreign_source_in_company_analysis");
          break;
        }
      }
    }
  }

  if (taskType === "outreach_copy" || taskType === "outreach_sequence" || taskType === "pitch_text") {
    const sequences = Array.isArray(payload.email_sequences) ? payload.email_sequences : [];
    const firstEmail =
      sequences[0] && Array.isArray(sequences[0].emails) ? sequences[0].emails[0] : null;
    if (!firstEmail || !sanitizeText(firstEmail.subject, 240) || !sanitizeText(firstEmail.body, 2000)) {
      errors.push("missing_ready_message");
    }
    if (!firstEmail || !sanitizeText(firstEmail.cta, 240)) {
      errors.push("missing_cta");
    }
    const rawText = JSON.stringify(payload).slice(0, 4000);
    if (OUTREACH_BLOCKER_PATTERN.test(rawText)) {
      errors.push("blocking_phrase_detected");
    }
  }

  return { ok: errors.length === 0, errors };
};

const clampByChars = (value, maxChars) => {
  const safe = clampAssistantText(value);
  if (!Number.isFinite(Number(maxChars)) || Number(maxChars) <= 0) return safe;
  return safe;
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

const FORMAT_SKIPPED_KEYS = new Set([
  "meta",
  "validation",
  "source_proof",
  "proof_refs",
  "why_here_proof_refs",
  "dedupe_key",
  "trace_summary",
  "input_echo",
  "knowledge_used",
  "budget_applied",
  "handoff",
  "web_stats",
  "quality_checks"
]);

const clampAssistantText = (value) => {
  const normalized = toText(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  return normalized || "";
};

const toScalarText = (value, maxChars = 260) => {
  if (typeof value === "string") return sanitizeText(value, maxChars);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "да" : "нет";
  return "";
};

const hasRenderableValue = (value, depth = 0) => {
  if (depth > 2) return Boolean(toScalarText(value, 80));

  if (toScalarText(value, 80)) return true;
  if (Array.isArray(value)) {
    return value.some((item) => hasRenderableValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, itemValue]) =>
        !FORMAT_SKIPPED_KEYS.has(String(key)) && hasRenderableValue(itemValue, depth + 1)
    );
  }
  return false;
};

const humanizeKey = (key) => {
  const normalized = toText(key)
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatPrimitiveList = (value, maxItems = 5, maxItemChars = 110) => {
  if (!Array.isArray(value)) return "";
  const items = value.map((item) => toScalarText(item, maxItemChars)).filter(Boolean);
  if (!items.length) return "";
  const visible = items.slice(0, maxItems);
  if (items.length <= maxItems) return visible.join(", ");
  return `${visible.join(", ")} (+${items.length - maxItems})`;
};

const pickItemTitle = (value, index = 0) => {
  const scalar = toScalarText(value, 180);
  if (scalar) return scalar;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `Пункт ${index + 1}`;
  }

  const priority = [
    "segment_name",
    "name",
    "title",
    "company_name",
    "headline",
    "label",
    "verdict",
    "summary",
    "final_summary",
    "decision",
    "text",
    "review"
  ];

  for (const key of priority) {
    const picked = toScalarText(value[key], 180);
    if (picked) return picked;
  }

  const anyText = Object.values(value)
    .map((item) => toScalarText(item, 180))
    .find(Boolean);

  return anyText || `Пункт ${index + 1}`;
};

const formatGenericObjectBlock = (value, options = {}) => {
  const safe = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const maxFieldsRaw = Number(options.maxFields);
  const entries = Object.entries(safe).filter(
    ([key, itemValue]) =>
      !FORMAT_SKIPPED_KEYS.has(String(key)) &&
      !String(key).startsWith("__") &&
      hasRenderableValue(itemValue)
  );
  const maxFields =
    Number.isFinite(maxFieldsRaw) && maxFieldsRaw > 0 ? Math.round(maxFieldsRaw) : entries.length;

  const lines = [];
  for (const [key, itemValue] of entries.slice(0, maxFields)) {
    const label = humanizeKey(key) || key;
    const scalar = toScalarText(itemValue, 220);
    if (scalar) {
      lines.push(`- ${label}: ${scalar}`);
      continue;
    }

    if (Array.isArray(itemValue)) {
      const inline = formatPrimitiveList(itemValue, 4, 90);
      if (inline) {
        lines.push(`- ${label}: ${inline}`);
        continue;
      }
      if (itemValue.length > 0) {
        const firstTitle = pickItemTitle(itemValue[0], 0);
        const suffix = itemValue.length > 1 ? ` (+${itemValue.length - 1})` : "";
        lines.push(`- ${label}: ${firstTitle}${suffix}`);
      }
      continue;
    }

    if (itemValue && typeof itemValue === "object") {
      const nestedTitle = pickItemTitle(itemValue, 0);
      if (nestedTitle) {
        lines.push(`- ${label}: ${nestedTitle}`);
      }
    }
  }

  return lines.join("\n");
};

const formatSegmentsSection = (segments) => {
  if (!Array.isArray(segments) || segments.length === 0) return "";
  const lines = [`Сегменты (${segments.length}):`];
  segments.forEach((item, index) => {
    const safe = item && typeof item === "object" ? item : {};
    const name = toScalarText(safe.segment_name, 180) || `Сегмент ${index + 1}`;
    lines.push(`${index + 1}. ${name}`);

    const geo = toScalarText(safe.geo, 120);
    if (geo) lines.push(`- Гео: ${geo}`);

    const economics = toScalarText(safe.avg_check_or_margin_estimate, 160);
    if (economics) lines.push(`- Экономика: ${economics}`);

    const lpr = formatPrimitiveList(safe.LPR, 4, 80);
    if (lpr) lines.push(`- ЛПР: ${lpr}`);

    const pains = formatPrimitiveList(safe.pain_triggers, 4, 90);
    if (pains) lines.push(`- Боли: ${pains}`);

    const why = formatPrimitiveList(safe.why_agentos, 4, 90);
    if (why) lines.push(`- Почему купят: ${why}`);

    const offer = toScalarText(safe.recommended_entry_offer, 180);
    if (offer) lines.push(`- Входной оффер: ${offer}`);

    const objections = formatPrimitiveList(safe.top_objections, 3, 90);
    if (objections) lines.push(`- Возражения: ${objections}`);
  });

  return lines.join("\n");
};

const formatCandidatesSection = (candidates) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const lines = [`Компании-кандидаты (${candidates.length}):`];

  candidates.forEach((item, index) => {
    const safe = item && typeof item === "object" ? item : {};
    const title =
      toScalarText(safe.name, 180) ||
      toScalarText(safe.name_placeholder, 180) ||
      `Кандидат ${index + 1}`;
    lines.push(`${index + 1}. ${title}`);

    const channel = toScalarText(safe.channel, 120);
    if (channel) lines.push(`- Канал: ${channel}`);

    const segmentMatch = toScalarText(safe.segment_match, 180);
    if (segmentMatch) lines.push(`- Сегмент: ${segmentMatch}`);

    const link = toScalarText(safe.link, 220);
    if (link) lines.push(`- Ссылка: ${link}`);

    const whyHere = toScalarText(safe.why_here, 240);
    if (whyHere) lines.push(`- Почему здесь: ${whyHere}`);

    const firstOffer = toScalarText(safe.first_offer, 220);
    if (firstOffer) lines.push(`- Первый оффер: ${firstOffer}`);

    const expectedOutcome = toScalarText(safe.expected_outcome, 220);
    if (expectedOutcome) lines.push(`- Ожидаемый эффект: ${expectedOutcome}`);

    const requiredAccess = toScalarText(safe.required_access, 180);
    if (requiredAccess) lines.push(`- Нужные доступы: ${requiredAccess}`);

    const confidence = Number(safe.confidence);
    const fitScore = Number(safe.fit_score);
    if (Number.isFinite(confidence) || Number.isFinite(fitScore)) {
      const parts = [];
      if (Number.isFinite(confidence)) parts.push(`confidence ${Math.round(confidence)}`);
      if (Number.isFinite(fitScore)) parts.push(`fit ${Math.round(fitScore)}`);
      lines.push(`- Оценка: ${parts.join(" / ")}`);
    }
  });

  return lines.join("\n");
};

const formatTopLevelSection = (key, value) => {
  const label = humanizeKey(String(key)) || String(key);
  const scalar = toScalarText(value, 520);
  if (scalar) return `${label}: ${scalar}`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${label}: нет данных.`;

    const inline = formatPrimitiveList(value, 8, 100);
    if (inline) return `${label}: ${inline}`;

    const objectItems = value.filter((item) => item && typeof item === "object");
    if (!objectItems.length) return "";

    const lines = [`${label} (${value.length}):`];
    objectItems.forEach((item, index) => {
      lines.push(`${index + 1}. ${pickItemTitle(item, index)}`);
      const details = formatGenericObjectBlock(item);
      if (details) lines.push(details);
    });
    return lines.join("\n");
  }

  if (value && typeof value === "object") {
    const details = formatGenericObjectBlock(value, { maxFields: 8 });
    if (!details) return "";
    return `${label}:\n${details}`;
  }

  return "";
};

const formatStructuredPayload = (payload) => {
  if (!payload || typeof payload !== "object") return "";

  if (Array.isArray(payload)) {
    if (payload.length === 0) return "Результат: нет данных.";
    return formatTopLevelSection("Результат", payload);
  }

  const lines = [];
  const handled = new Set();

  if (Array.isArray(payload.segments) && payload.segments.length > 0) {
    const section = formatSegmentsSection(payload.segments);
    if (section) {
      lines.push(section);
      handled.add("segments");
    }
  }

  if (Array.isArray(payload.company_candidates) && payload.company_candidates.length > 0) {
    const section = formatCandidatesSection(payload.company_candidates);
    if (section) {
      lines.push(section);
      handled.add("company_candidates");
    }
  }

  const preferredKeys = [
    "summary",
    "review",
    "analysis",
    "final_summary",
    "decision",
    "verdict",
    "recommendation",
    "next_actions",
    "seven_day_plan",
    "metrics_to_track"
  ].filter((key) => Object.prototype.hasOwnProperty.call(payload, key));

  const remainingKeys = Object.keys(payload).filter((key) => !preferredKeys.includes(key));
  const keys = [...preferredKeys, ...remainingKeys];

  for (const key of keys) {
    if (handled.has(key)) continue;
    if (FORMAT_SKIPPED_KEYS.has(key) || key.startsWith("__")) continue;

    const section = formatTopLevelSection(key, payload[key]);
    if (section) lines.push(section);
  }

  if (lines.length === 0) {
    const visibleKeys = Object.keys(payload).filter(
      (key) => !FORMAT_SKIPPED_KEYS.has(key) && !key.startsWith("__")
    );
    if (visibleKeys.length === 0) {
      return "Ответ получен. Данных для отображения нет.";
    }
    return `Ответ получен. Поля без содержимого: ${visibleKeys.join(", ")}.`;
  }

  return lines.join("\n\n");
};

const tryParseJsonString = (value) => {
  const raw = toText(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return null;

  const safe = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!safe) return null;
  if (!safe.startsWith("{") && !safe.startsWith("[")) return null;

  try {
    return JSON.parse(safe);
  } catch {
    return null;
  }
};

const escapeMdCell = (value, maxChars = 220) =>
  sanitizeText(String(value ?? ""), maxChars)
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ");

const buildArtemMarkdownOutput = (payload) => {
  const safe = payload && typeof payload === "object" ? payload : {};
  const leads = Array.isArray(safe.hot_leads) ? safe.hot_leads : [];
  const meta = safe.meta && typeof safe.meta === "object" ? safe.meta : {};
  const statusCode = sanitizeText(meta.status_code, 80) || "OK";
  const debug = meta.search_debug && typeof meta.search_debug === "object" ? meta.search_debug : {};
  const searchQueries = Array.isArray(debug.searchQueries)
    ? debug.searchQueries.map((item) => sanitizeText(item, 220)).filter(Boolean)
    : Array.isArray(meta.search_plan?.queries_used)
      ? meta.search_plan.queries_used.map((item) => sanitizeText(item, 220)).filter(Boolean)
      : [];
  const intentJson =
    debug.intent_json && typeof debug.intent_json === "object" ? debug.intent_json : null;
  const totalTokens = Number.isFinite(Number(debug.total_tokens))
    ? Number(debug.total_tokens)
    : Number.isFinite(Number(meta.lead_stats?.llm_tokens_total))
      ? Number(meta.lead_stats.llm_tokens_total)
      : 0;
  const sourceCategories =
    debug.source_categories && typeof debug.source_categories === "object"
      ? Object.entries(debug.source_categories)
          .map(([kind, count]) => [sanitizeText(kind, 80), Number(count || 0)])
          .filter(([kind, count]) => Boolean(kind) && Number.isFinite(count) && count > 0)
          .sort((a, b) => b[1] - a[1])
      : [];
  const droppedArticlesForums = Number.isFinite(Number(debug.dropped_articles_forums))
    ? Number(debug.dropped_articles_forums)
    : Number.isFinite(Number(meta.lead_stats?.dropped_articles_forums))
      ? Number(meta.lead_stats.dropped_articles_forums)
      : 0;
  const negativeKeywords = Array.isArray(debug.negative_keywords)
    ? debug.negative_keywords.map((item) => sanitizeText(item, 80)).filter(Boolean)
    : Array.isArray(meta.negative_keywords)
      ? meta.negative_keywords.map((item) => sanitizeText(item, 80)).filter(Boolean)
      : [];
  const filteredIrrelevantCount = Number.isFinite(Number(debug.filtered_irrelevant_count))
    ? Number(debug.filtered_irrelevant_count)
    : Number.isFinite(Number(meta.lead_stats?.filtered_irrelevant_count))
      ? Number(meta.lead_stats.filtered_irrelevant_count)
      : 0;
  const filteredReasons =
    debug.filtered_reasons && typeof debug.filtered_reasons === "object"
      ? Object.entries(debug.filtered_reasons)
          .map(([reason, count]) => [sanitizeText(reason, 120), Number(count || 0)])
          .filter(([reason, count]) => Boolean(reason) && Number.isFinite(count) && count > 0)
          .sort((a, b) => b[1] - a[1])
      : [];
  const llmNotCalled = Boolean(debug.llm_not_called);
  const modelsPerStep =
    debug.models_per_step && typeof debug.models_per_step === "object"
      ? Object.entries(debug.models_per_step)
          .map(([step, model]) => [sanitizeText(step, 120), sanitizeText(model, 120)])
          .filter(([step, model]) => Boolean(step) && Boolean(model))
      : [];
  const limitations = Array.isArray(meta.limitations)
    ? meta.limitations.map((item) => sanitizeText(item, 240)).filter(Boolean)
    : [];
  const warmTargets = Array.isArray(meta.warm_targets)
    ? meta.warm_targets
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const topBestSegments = Array.isArray(meta.top_best_segments)
    ? meta.top_best_segments
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const whereToGetLists = Array.isArray(meta.where_to_get_company_lists)
    ? meta.where_to_get_company_lists
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const universalSources = Array.isArray(meta.universal_sources_for_all_segments)
    ? meta.universal_sources_for_all_segments
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const pasteListToRank =
    meta.paste_list_to_rank && typeof meta.paste_list_to_rank === "object"
      ? meta.paste_list_to_rank
      : null;
  const howToExtractFast = Array.isArray(meta.how_to_extract_list_fast)
    ? meta.how_to_extract_list_fast
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const acquisitionPlaybook = Array.isArray(meta.acquisition_playbook)
    ? meta.acquisition_playbook
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const manualKit =
    meta.manual_hot_hunting && typeof meta.manual_hot_hunting === "object"
      ? meta.manual_hot_hunting
      : null;
  const rankProvided =
    meta.rank_provided_list && typeof meta.rank_provided_list === "object"
      ? meta.rank_provided_list
      : null;
  const messageTemplates =
    meta.message_templates && typeof meta.message_templates === "object"
      ? meta.message_templates
      : null;
  const webSearchState =
    debug.web_search && typeof debug.web_search === "object"
      ? {
          enabled: Boolean(debug.web_search.enabled),
          reason: sanitizeText(debug.web_search.reason, 120),
          provider: sanitizeText(debug.web_search.provider, 120)
        }
      : null;
  const geoScope = sanitizeText(debug.geo_scope || meta.search_plan?.geo_scope, 60) || "cis";
  const geoDropCount = Number.isFinite(Number(debug.geo_drop_count))
    ? Number(debug.geo_drop_count)
    : 0;
  const geoDropExamples = Array.isArray(debug.geo_drop_examples)
    ? debug.geo_drop_examples
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const candidatesFromInput = Number.isFinite(Number(debug.candidates_from_input))
    ? Number(debug.candidates_from_input)
    : 0;
  const needDomainCount = Number.isFinite(Number(debug.need_domain_count))
    ? Number(debug.need_domain_count)
    : Number.isFinite(Number(rankProvided?.candidates_need_domain))
      ? Number(rankProvided.candidates_need_domain)
      : 0;
  const vendorFilteredCount = Number.isFinite(Number(debug.vendor_filtered_count))
    ? Number(debug.vendor_filtered_count)
    : 0;
  const searchTarget = sanitizeText(debug.search_target, 40) || "buyer_only";

  const lines = ["### Артем — Горячие лиды", ""];

  if (statusCode !== "OK") {
    lines.push(`Статус: \`${statusCode}\``);
    lines.push("");
  }

  if (
    statusCode === "NO_WEB_SEARCH_CONFIGURED" ||
    statusCode === "POTENTIAL_CLIENTS_ONLY"
  ) {
    lines.push("A) Top 10 best segments");
    if (topBestSegments.length === 0) {
      lines.push("Top 10 best segments: нет данных.");
    } else {
      lines.push("| Rank | Segment | Why fit now | Size | ICP fit | Why partial | How to narrow | LPR roles | HRD hook | COO hook | Confidence |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
      topBestSegments.slice(0, 10).forEach((item, index) => {
        const safe = item && typeof item === "object" ? item : {};
        const roles = Array.isArray(safe.lpr_roles)
          ? safe.lpr_roles.map((role) => sanitizeText(role, 80)).filter(Boolean).join(", ")
          : sanitizeText(safe.lpr_roles, 140);
        lines.push(
          `| ${index + 1} | ${escapeMdCell(
            safe.company_type || safe.niche || "—",
            140
          )} | ${escapeMdCell(
            safe.why_need || safe.pain_trigger || "—",
            220
          )} | ${escapeMdCell(
            safe.size_range || "20-1000",
            40
          )} | ${escapeMdCell(
            safe.icp_fit || "—",
            32
          )} | ${escapeMdCell(
            safe.why_partial || "—",
            180
          )} | ${escapeMdCell(
            safe.how_to_narrow || "—",
            180
          )} | ${escapeMdCell(roles || "—", 140)} | ${escapeMdCell(
            safe.hrd_hook || "—",
            180
          )} | ${escapeMdCell(safe.coo_hook || "—", 180)} | ${escapeMdCell(
            String(safe.confidence ?? 70),
            10
          )} |`
        );
      });
    }

    lines.push("");
    lines.push("B) Where to get company lists");
    if (universalSources.length > 0) {
      lines.push("Universal sources for all segments:");
      universalSources.slice(0, 6).forEach((source) => {
        const name = sanitizeText(source?.name, 160) || "source";
        const type = sanitizeText(source?.type, 80) || "source";
        const where = sanitizeText(source?.where, 220) || "—";
        const quick = sanitizeText(source?.quick_collect_3min, 220);
        lines.push(`- ${name} (${type}): ${where}${quick ? ` | 3 min: ${quick}` : ""}`);
      });
      lines.push("");
    }
    if (whereToGetLists.length === 0) {
      lines.push("Where to get company lists: нет данных.");
    } else {
      whereToGetLists.slice(0, 10).forEach((item, index) => {
        const segment = sanitizeText(item?.segment, 180) || `Segment ${index + 1}`;
        lines.push(`${index + 1}. ${segment}`);
        const sources = Array.isArray(item?.sources)
          ? item.sources
              .map((source) => (source && typeof source === "object" ? source : null))
              .filter(Boolean)
          : [];
        if (sources.length === 0) {
          lines.push("- Источники: —");
        } else {
          sources.slice(0, 4).forEach((source) => {
            const name = sanitizeText(source?.name, 160) || "source";
            const type = sanitizeText(source?.type, 80) || "source";
            const where = sanitizeText(source?.where, 220) || "—";
            const quick = sanitizeText(source?.quick_collect_3min, 220);
            lines.push(`- ${name} (${type}): ${where}${quick ? ` | 3 min: ${quick}` : ""}`);
          });
        }
        const tip = sanitizeText(item?.sourcing_tip, 220);
        if (tip) lines.push(`- Совет: ${tip}`);
      });
    }

    lines.push("");
    lines.push("C) Paste list to rank");
    if (pasteListToRank) {
      const instruction = sanitizeText(
        pasteListToRank.instruction || pasteListToRank.title || "",
        300
      );
      if (instruction) lines.push(instruction);
      const expected = sanitizeText(pasteListToRank.expected_items, 40);
      if (expected) lines.push(`Ожидаемый объём: ${expected}`);
      const mode = sanitizeText(pasteListToRank.mode, 40);
      if (mode) lines.push(`Режим: ${mode}`);
      const recommendedFormat = sanitizeText(pasteListToRank.recommended_format, 200);
      if (recommendedFormat) lines.push(`Recommended format: ${recommendedFormat}`);
      if (Array.isArray(pasteListToRank.accepted_formats)) {
        lines.push("Fallback formats:");
        pasteListToRank.accepted_formats
          .map((item) => sanitizeText(item, 180))
          .filter(Boolean)
          .slice(0, 6)
          .forEach((item) => lines.push(`- ${item}`));
      }
      if (Array.isArray(pasteListToRank.sample_input) && pasteListToRank.sample_input.length > 0) {
        lines.push("Пример:");
        pasteListToRank.sample_input
          .map((item) => sanitizeText(item, 200))
          .filter(Boolean)
          .slice(0, 6)
          .forEach((item) => lines.push(`- ${item}`));
      }
      if (Array.isArray(pasteListToRank.domain_guidance) && pasteListToRank.domain_guidance.length > 0) {
        lines.push("Где взять домен, если его нет (NEED_DOMAIN):");
        pasteListToRank.domain_guidance
          .map((item) => sanitizeText(item, 180))
          .filter(Boolean)
          .slice(0, 6)
          .forEach((item) => lines.push(`- ${item}`));
      }
    } else {
      lines.push("Вставьте 30-200 компаний/доменов/URL, чтобы перейти в RANK_PROVIDED_LIST.");
    }

    lines.push("");
    lines.push("D) How to extract list fast");
    const extractionSteps = howToExtractFast.length > 0 ? howToExtractFast : acquisitionPlaybook;
    if (extractionSteps.length === 0) {
      lines.push("How to extract list fast: нет данных.");
    } else {
      extractionSteps.slice(0, 5).forEach((step, index) => {
        const title = sanitizeText(step?.title, 140) || `Шаг ${index + 1}`;
        const action = sanitizeText(step?.action, 260) || "—";
        const timebox = sanitizeText(step?.timebox, 60) || "—";
        lines.push(`${index + 1}. ${title} (${timebox})`);
        lines.push(`- ${action}`);
      });
    }

    lines.push("");
    lines.push("E) 2 message templates");
    if (messageTemplates && Array.isArray(messageTemplates.hrd) && Array.isArray(messageTemplates.coo)) {
      lines.push("HRD:");
      messageTemplates.hrd
        .map((item) => sanitizeText(item, 220))
        .filter(Boolean)
        .slice(0, 6)
        .forEach((line, index) => lines.push(`${index + 1}. ${line}`));
      lines.push("");
      lines.push("COO:");
      messageTemplates.coo
        .map((item) => sanitizeText(item, 220))
        .filter(Boolean)
        .slice(0, 6)
        .forEach((line, index) => lines.push(`${index + 1}. ${line}`));
    } else {
      lines.push("Шаблоны не найдены.");
    }

    lines.push("");
    lines.push("F) Warm targets");
    if (warmTargets.length === 0) {
      lines.push("Warm targets: нет данных.");
    } else {
      lines.push("| Rank | Company/Type | Why fit now | Size | ICP fit | LPR roles | Where to find contacts | Confidence |");
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
      warmTargets.slice(0, 30).forEach((item, index) => {
        const safe = item && typeof item === "object" ? item : {};
        const roles = Array.isArray(safe.lpr_roles)
          ? safe.lpr_roles.map((role) => sanitizeText(role, 80)).filter(Boolean).join(", ")
          : sanitizeText(safe.lpr_roles, 120);
        lines.push(
          `| ${index + 1} | ${escapeMdCell(
            safe.company_type || safe.niche || "—",
            140
          )} | ${escapeMdCell(safe.why_need || safe.pain_trigger || "—", 220)} | ${escapeMdCell(
            safe.size_range || "20-1000",
            40
          )} | ${escapeMdCell(
            safe.icp_fit || "—",
            32
          )} | ${escapeMdCell(roles || "—", 140)} | ${escapeMdCell(
            safe.where_to_find_contacts || "—",
            220
          )} | ${escapeMdCell(String(safe.confidence ?? 70), 10)} |`
        );
      });
    }

    if (manualKit && Array.isArray(manualKit.short_queries) && manualKit.short_queries.length > 0) {
      lines.push("");
      lines.push("G) Manual hunting kit (short queries)");
      manualKit.short_queries
        .map((item) => sanitizeText(item, 180))
        .filter(Boolean)
        .slice(0, 25)
        .forEach((query, index) => {
          lines.push(`${index + 1}. ${query}`);
        });
    }
  } else if (leads.length === 0) {
    lines.push("0 лидов.");
  } else {
    const hotLeads = leads.filter((lead) => String(lead?.lead_type || "").toLowerCase() === "hot");
    const warmLeads = leads.filter((lead) => String(lead?.lead_type || "").toLowerCase() !== "hot");

    const renderLeadTable = (sectionTitle, sectionLeads) => {
      if (!Array.isArray(sectionLeads) || sectionLeads.length === 0) {
        lines.push(`${sectionTitle}: нет данных.`);
        return;
      }
      lines.push(sectionTitle);
      lines.push(
        "| Rank | Who (company/organization) | Title | Real URL | Source | Evidence | Why now | Where to contact | Status | Next action | Confidence(0-100) | Lead type |"
      );
      lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

      sectionLeads.slice(0, 20).forEach((lead, index) => {
        const safeLead = lead && typeof lead === "object" ? lead : {};
        const url = sanitizeText(safeLead.url, 500);
        const source = sanitizeText(safeLead.source, 60);
        const title = escapeMdCell(safeLead.title || "Без названия", 180);
        const who = escapeMdCell(
          safeLead.who ||
            safeLead.company_or_organization ||
            safeLead.company ||
            "source post/job/tender",
          140
        );
        const evidence = escapeMdCell(safeLead.evidence || safeLead.request_summary || "", 200);
        const whyNow = escapeMdCell(
          safeLead.why_now ||
            safeLead.why_match ||
            (Array.isArray(safeLead.hot_reasons) ? safeLead.hot_reasons.join("; ") : ""),
          220
        );
        const whereToContact = escapeMdCell(
          safeLead.where_to_contact || safeLead.contact_hint || "",
          220
        );
        const leadType = escapeMdCell(
          sanitizeText(safeLead.lead_type, 20) ||
            (safeLead.is_hot_lead ? "Hot" : "Warm"),
          20
        );
        const status = escapeMdCell(sanitizeText(safeLead.status || safeLead.domain_status, 20) || "READY", 20);
        const nextAction = escapeMdCell(sanitizeText(safeLead.next_action, 220) || "—", 220);
        const confidence = Number(safeLead.confidence);
        const confidenceText = Number.isFinite(confidence)
          ? String(Math.max(0, Math.min(100, Math.round(confidence))))
          : String(Math.max(0, Math.min(100, Math.round(Number(safeLead.hot_score || 0)))));
        const linkText = url ? `[${escapeMdCell(url, 220)}](${url})` : "—";

        lines.push(
          `| ${index + 1} | ${who || "source post/job/tender"} | ${title || "—"} | ${linkText} | ${escapeMdCell(source || "web", 50)} | ${evidence || "—"} | ${whyNow || "—"} | ${whereToContact || "—"} | ${status} | ${nextAction} | ${confidenceText} | ${leadType || "Warm"} |`
        );
      });
    };

    renderLeadTable("A) Hot leads", hotLeads);
    lines.push("");
    renderLeadTable("B) Warm targets", warmLeads);
    if (rankProvided && Array.isArray(rankProvided.ready_messages) && rankProvided.ready_messages.length > 0) {
      lines.push("");
      lines.push("Готовые сообщения (Top 10):");
      rankProvided.ready_messages.slice(0, 10).forEach((message, index) => {
        const safe = sanitizeText(message, 320);
        if (safe) lines.push(`${index + 1}. ${safe}`);
      });
    }
  }

  if (limitations.length > 0) {
    lines.push("");
    lines.push("Причины/ограничения:");
    limitations.slice(0, 8).forEach((item) => {
      lines.push(`- ${item}`);
    });
  }

  if (
    searchQueries.length > 0 ||
    negativeKeywords.length > 0 ||
    filteredIrrelevantCount > 0 ||
    totalTokens > 0 ||
    llmNotCalled ||
    Boolean(webSearchState) ||
    candidatesFromInput > 0 ||
    vendorFilteredCount > 0 ||
    Boolean(intentJson)
  ) {
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>Diagnostics</summary>");
    lines.push("");
    lines.push(`total_tokens: ${totalTokens}`);
    lines.push(`llm_status: ${llmNotCalled ? "LLM not called" : "LLM called"}`);
    lines.push(`geo_scope: ${geoScope}`);
    lines.push(`search_target: ${searchTarget}`);
    if (webSearchState) {
      lines.push(
        `web_search: ${webSearchState.enabled ? "enabled" : "disabled"} (${webSearchState.reason || "n/a"}, provider=${webSearchState.provider || "n/a"})`
      );
    }
    lines.push(`candidates_from_input: ${candidatesFromInput}`);
    lines.push(`need_domain_count: ${needDomainCount}`);
    lines.push(`vendor_filtered_count: ${vendorFilteredCount}`);
    lines.push(`geo_drop_count: ${geoDropCount}`);
    if (modelsPerStep.length > 0) {
      lines.push("");
      lines.push("models_per_step:");
      modelsPerStep.forEach(([step, model]) => {
        lines.push(`- ${step}: ${model}`);
      });
    }
    lines.push("");
    lines.push(`Filtered as irrelevant: ${filteredIrrelevantCount}`);
    lines.push(`Dropped as article/forum/dictionary: ${droppedArticlesForums}`);
    if (sourceCategories.length > 0) {
      lines.push("");
      lines.push("source_categories:");
      sourceCategories.forEach(([kind, count]) => {
        lines.push(`- ${kind}: ${count}`);
      });
    }
    if (filteredReasons.length > 0) {
      lines.push("");
      lines.push("filtered_reasons:");
      filteredReasons.forEach(([reason, count]) => {
        lines.push(`- ${reason}: ${count}`);
      });
    }
    if (geoDropExamples.length > 0) {
      lines.push("");
      lines.push("outside_geo_examples:");
      geoDropExamples.slice(0, 5).forEach((item, index) => {
        const domain = sanitizeText(item?.domain, 120) || "unknown";
        const reason = sanitizeText(item?.reason, 160) || "outside geo";
        lines.push(`${index + 1}. ${domain} — ${reason}`);
      });
    }
    if (negativeKeywords.length > 0) {
      lines.push("");
      lines.push(`negative_keywords: ${negativeKeywords.join(", ")}`);
    }
    if (intentJson) {
      const offerShort = Array.isArray(intentJson?.offer?.keywords)
        ? intentJson.offer.keywords.slice(0, 3).join(", ")
        : Array.isArray(intentJson?.flat?.keywords)
          ? intentJson.flat.keywords.slice(0, 3).join(", ")
          : "";
      const icpShort = Array.isArray(intentJson?.icp?.industries)
        ? intentJson.icp.industries.slice(0, 3).join(", ")
        : Array.isArray(intentJson?.flat?.target_customer)
          ? intentJson.flat.target_customer.slice(0, 3).join(", ")
          : "";
      const geoShort = Array.isArray(intentJson?.icp?.geo)
        ? intentJson.icp.geo.slice(0, 2).join(", ")
        : Array.isArray(intentJson?.flat?.geo)
          ? intentJson.flat.geo.slice(0, 2).join(", ")
          : "";
      const languageShort =
        sanitizeText(String(intentJson?.constraints?.language || intentJson?.flat?.language || "-"), 20) ||
        "-";
      lines.push("");
      lines.push(
        `intent_short: offer=${escapeMdCell(
          offerShort,
          120
        ) || "-"}; icp=${escapeMdCell(
          icpShort,
          120
        ) || "-"}; geo=${escapeMdCell(
          geoShort,
          80
        ) || "-"}; language=${escapeMdCell(languageShort, 20)}`
      );
      lines.push("");
      lines.push("intent_json:");
      lines.push("```json");
      lines.push(JSON.stringify(intentJson, null, 2));
      lines.push("```");
    }
    if (searchQueries.length > 0) {
      lines.push("");
      lines.push("queries_used:");
      searchQueries.slice(0, 20).forEach((query, index) => {
        lines.push(`${index + 1}. ${query}`);
      });
    }
    lines.push("</details>");
  }

  return lines.join("\n");
};

const sanitizeOutputText = (value) =>
  String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

const toScalarTextLoose = (value) => {
  if (typeof value === "string") return sanitizeOutputText(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "да" : "нет";
  return "";
};

const toHumanLabel = (key) =>
  String(key || "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractFirstUrlRaw = (text) => {
  const source = sanitizeOutputText(text);
  if (!source) return "";
  const protocolMatch = source.match(URL_WITH_PROTOCOL_SINGLE_REGEX);
  if (protocolMatch?.[0]) {
    return protocolMatch[0].replace(/[),.;!?]+$/g, "").trim();
  }
  const domainMatch = source.match(DOMAIN_LIKE_SINGLE_REGEX);
  if (domainMatch?.[0]) {
    return domainMatch[0].replace(/[),.;!?]+$/g, "").trim();
  }
  return "";
};

const extractUrlsFromAny = (value, set = new Set()) => {
  if (set.size >= 300) return set;
  const scalar = toScalarTextLoose(value);
  if (scalar) {
    for (const url of extractUrlsFromText(scalar)) {
      set.add(url);
    }
    return set;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractUrlsFromAny(item, set));
    return set;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => extractUrlsFromAny(item, set));
  }
  return set;
};

const collectSummaryLines = (payload, rawText) => {
  const lines = [];

  const pushLines = (value, maxLines = 6) => {
    const text = sanitizeOutputText(value);
    if (!text) return;
    text
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean)
      .forEach((line) => {
        if (lines.length < maxLines && !lines.includes(line)) lines.push(line);
      });
  };

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    [
      payload.summary,
      payload.final_summary,
      payload.review,
      payload.analysis,
      payload.decision,
      payload.verdict,
      payload.recommendation
    ].forEach((item) => pushLines(item));

    if (payload.account_card && typeof payload.account_card === "object") {
      const company = toScalarTextLoose(payload.account_card.company_name);
      const website = toScalarTextLoose(payload.account_card.primary_url);
      if (company) pushLines(`Разобрана компания: ${company}`);
      if (website) pushLines(`Целевой сайт: ${website}`);
    }
  }

  if (lines.length < 3) {
    pushLines(rawText, 6);
  }
  if (lines.length === 0) {
    lines.push("Ответ подготовлен по запросу пользователя.");
    lines.push("Собраны ключевые наблюдения и рекомендации.");
    lines.push("Ниже — полный результат без служебной телеметрии.");
  }
  while (lines.length < 3) {
    lines.push("Данные обработаны без сокращений.");
  }

  return lines.slice(0, 6);
};

const collectStringList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const scalar = toScalarTextLoose(item);
        if (scalar) return scalar;
        if (item && typeof item === "object") {
          const compact = Object.entries(item)
            .map(([key, val]) => {
              const scalarValue = toScalarTextLoose(val);
              return scalarValue ? `${toHumanLabel(key)}: ${scalarValue}` : "";
            })
            .filter(Boolean)
            .join("; ");
          return sanitizeOutputText(compact);
        }
        return "";
      })
      .filter(Boolean);
  }
  const scalar = toScalarTextLoose(value);
  return scalar ? [scalar] : [];
};

const collectNextSteps = (payload, taskType) => {
  if (payload && typeof payload === "object") {
    const candidates = [
      payload.next_steps,
      payload.nextSteps,
      payload.next_actions,
      payload.recommended_next_steps,
      payload.seven_day_plan,
      payload.quick_wins,
      payload.recommendations
    ];
    for (const candidate of candidates) {
      const lines = collectStringList(candidate);
      if (lines.length > 0) return lines;
    }
  }

  if (taskType === "company_analysis") {
    return [
      "Проверить и подтвердить целевой URL компании перед запуском контакта.",
      "Согласовать 1–2 приоритетные гипотезы и критерии успеха.",
      "Подготовить персонализированное первое касание и список уточняющих вопросов."
    ];
  }
  if (taskType === "lead_scoring") {
    return [
      "Отсортировать лиды по confidence и приоритету входа.",
      "Назначить первый канал касания и короткий value message.",
      "Поставить follow-up задачу и метрику ответа по каждому лиду."
    ];
  }
  return [
    "Подтвердить исходные вводные и ограничения задачи.",
    "Выбрать 3 приоритетных действия из основной части.",
    "Зафиксировать метрику результата и контрольную дату проверки."
  ];
};

const renderStructuredValue = (value, depth = 0) => {
  const indent = "  ".repeat(depth);
  const scalar = toScalarTextLoose(value);
  if (scalar) {
    return `${indent}${scalar}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}- нет данных`;
    const lines = [];
    value.forEach((item, index) => {
      const itemScalar = toScalarTextLoose(item);
      if (itemScalar) {
        lines.push(`${indent}${index + 1}. ${itemScalar}`);
        return;
      }
      lines.push(`${indent}${index + 1}.`);
      lines.push(renderStructuredValue(item, depth + 1));
    });
    return lines.join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => {
      const normalized = String(key || "").toLowerCase();
      if (String(key).startsWith("__")) return false;
      if (USER_FACING_INTERNAL_KEYS.has(normalized)) return false;
      if (normalized.includes("trace")) return false;
      if (normalized.includes("debug")) return false;
      if (normalized.includes("telemetry")) return false;
      return true;
    });
    if (entries.length === 0) return `${indent}- нет данных`;
    const lines = [];
    entries.forEach(([key, item]) => {
      const label = toHumanLabel(key) || key;
      const itemScalar = toScalarTextLoose(item);
      if (itemScalar) {
        lines.push(`${indent}- ${label}: ${itemScalar}`);
        return;
      }
      lines.push(`${indent}- ${label}:`);
      lines.push(renderStructuredValue(item, depth + 1));
    });
    return lines.join("\n");
  }

  return `${indent}-`;
};

const pickCompanyFields = (payload, context = {}) => {
  const userPrompt = sanitizeOutputText(context.userPrompt);
  const userProvidedRawUrl = sanitizeOutputText(context.userProvidedUrl) || extractFirstUrlRaw(userPrompt);
  const userProvidedNormalizedUrl = normalizeUrlFromText(userProvidedRawUrl);

  const payloadWebsiteCandidates = [];
  const payloadNameCandidates = [];

  const pushWebsite = (value) => {
    const scalar = toScalarTextLoose(value);
    if (!scalar) return;
    const normalized = normalizeUrlFromText(scalar);
    if (normalized) payloadWebsiteCandidates.push({ raw: scalar, normalized });
  };
  const pushName = (value) => {
    const scalar = toScalarTextLoose(value);
    if (!scalar) return;
    payloadNameCandidates.push(scalar);
  };

  if (payload && typeof payload === "object") {
    pushWebsite(payload.companyWebsite);
    pushWebsite(payload.company_website);
    pushWebsite(payload.company_domain_or_url);
    pushWebsite(payload.primary_url);
    pushWebsite(payload.url);
    pushWebsite(payload.website);

    pushName(payload.companyName);
    pushName(payload.company_name);
    pushName(payload.name);
    pushName(payload.project_name);

    if (payload.account_card && typeof payload.account_card === "object") {
      pushWebsite(payload.account_card.primary_url);
      pushWebsite(payload.account_card.company_website);
      pushName(payload.account_card.company_name);
    }
  }

  const website =
    userProvidedNormalizedUrl ||
    payloadWebsiteCandidates.find((item) => item.normalized)?.normalized ||
    normalizeUrlFromText(payloadWebsiteCandidates.find((item) => item.raw)?.raw || "") ||
    "";

  let companyName = payloadNameCandidates.find((name) => !isLikelyUserRequestText(name)) || "";
  if (!companyName) {
    companyName = deriveCompanyNameFromUrl(userProvidedNormalizedUrl || website);
  }
  if (!companyName) companyName = "Не определено";

  return {
    companyName: sanitizeOutputText(companyName),
    companyWebsite: sanitizeOutputText(website)
  };
};

const toOutputValue = (value, fallback = "") => {
  const scalar = toScalarTextLoose(value);
  if (scalar) return scalar;
  if (Array.isArray(value)) {
    const list = collectStringList(value);
    return list.join(" | ") || fallback;
  }
  if (value && typeof value === "object") {
    return renderStructuredValue(value);
  }
  return fallback;
};

const collectCompanyAnalysisSources = (payload, companyWebsite) => {
  if (!payload || typeof payload !== "object") return [];
  const targetWebsite = normalizeUrlFromText(companyWebsite || payload?.account_card?.primary_url || "");
  const targetDomain =
    getDomainFromUrl(targetWebsite) ||
    sanitizeOutputText(payload?.meta?.target_domain || "");
  const officialList = Array.isArray(payload?.meta?.official_channels)
    ? payload.meta.official_channels.map((item) => normalizeUrlFromText(item)).filter(Boolean)
    : [];
  const officialSet = new Set(officialList);

  const candidates = new Set();
  const pushCandidate = (value) => {
    const normalized = normalizeUrlFromText(value);
    if (!normalized) return;
    if (isSameDomainOrSubdomain(normalized, targetDomain)) {
      candidates.add(normalized);
      return;
    }
    if (officialSet.has(normalized)) {
      candidates.add(normalized);
    }
  };

  pushCandidate(targetWebsite);
  const discovered = payload?.account_card?.discovered_channels;
  if (discovered && typeof discovered === "object") {
    Object.values(discovered).forEach((item) => {
      if (Array.isArray(item)) {
        item.forEach((url) => pushCandidate(url));
      } else {
        pushCandidate(item);
      }
    });
  }

  if (Array.isArray(payload?.meta?.user_facing_sources)) {
    payload.meta.user_facing_sources.forEach((url) => pushCandidate(url));
  }
  if (Array.isArray(payload?.meta?.proof_items)) {
    payload.meta.proof_items.forEach((item) => pushCandidate(item?.url));
  }

  return Array.from(candidates).slice(0, 20);
};

const renderCompanyAnalysisMain = ({ payload, companyWebsite }) => {
  const card =
    payload && typeof payload === "object" && payload.account_card && typeof payload.account_card === "object"
      ? payload.account_card
      : {};
  const lines = [];
  const siteUrl = normalizeUrlFromText(companyWebsite || card.primary_url || "");
  if (siteUrl) lines.push(`Целевой сайт: ${siteUrl}`);

  lines.push(`Что продают: ${toScalarTextLoose(card.what_they_sell) || "Нужно уточнение на ключевых страницах сайта."}`);
  lines.push(`Кому продают: ${toScalarTextLoose(card.who_they_sell_to) || "Не определено (hypothesis требуется)."}`);

  lines.push("");
  lines.push("Аудит ключевых страниц:");
  const checklist = Array.isArray(card.quick_audit_checklist) ? card.quick_audit_checklist : [];
  if (checklist.length === 0) {
    lines.push("1. Нет подтверждённых данных по ключевым страницам.");
  } else {
    checklist.slice(0, 10).forEach((item, index) => {
      const check = toScalarTextLoose(item?.check) || `Проверка ${index + 1}`;
      const status = toScalarTextLoose(item?.status) || "WARN";
      const detail = toScalarTextLoose(item?.detail) || "Без конкретики.";
      const sourceUrl = normalizeUrlFromText(item?.source_url || "");
      lines.push(`${index + 1}. ${check} — ${status}`);
      lines.push(`- ${detail}${sourceUrl ? ` (источник: ${sourceUrl})` : ""}`);
    });
  }

  const hooks = Array.isArray(card.top_personalization_hooks) ? card.top_personalization_hooks : [];
  lines.push("");
  lines.push("Персонализация:");
  if (hooks.length === 0) {
    lines.push("- Хуки не найдены.");
  } else {
    hooks.slice(0, 5).forEach((item) => {
      const text = toScalarTextLoose(item?.hook_text);
      const sourceUrl = normalizeUrlFromText(item?.source_url || "");
      if (!text) return;
      lines.push(`- ${text}${sourceUrl ? ` (источник: ${sourceUrl})` : ""}`);
    });
  }

  const hypotheses = Array.isArray(card.pain_hypotheses) ? card.pain_hypotheses : [];
  lines.push("");
  lines.push("Гипотезы боли:");
  if (hypotheses.length === 0) {
    lines.push("- Недостаточно данных для гипотез.");
  } else {
    hypotheses.slice(0, 3).forEach((item, index) => {
      const statement = toScalarTextLoose(item?.statement) || toScalarTextLoose(item);
      if (statement) lines.push(`${index + 1}. ${statement}`);
    });
  }

  const wins = Array.isArray(card.quick_wins) ? card.quick_wins : [];
  lines.push("");
  lines.push("Быстрые шаги:");
  if (wins.length === 0) {
    lines.push("- Нужны данные для quick wins.");
  } else {
    wins.slice(0, 3).forEach((item, index) => {
      const text = toScalarTextLoose(item);
      if (text) lines.push(`${index + 1}. ${text}`);
    });
  }

  const contact = card.public_contacts && typeof card.public_contacts === "object" ? card.public_contacts : {};
  lines.push("");
  lines.push("Контакты и канал:");
  lines.push(`- Email: ${toScalarTextLoose(contact.email) || "не найден"}`);
  lines.push(`- Телефон: ${toScalarTextLoose(contact.phone) || "не найден"}`);
  const messengers = Array.isArray(contact.messengers)
    ? contact.messengers.map((item) => toScalarTextLoose(item)).filter(Boolean)
    : [];
  lines.push(`- Мессенджеры: ${messengers.join(", ") || "не найдено"}`);
  lines.push(`- Лучший канал: ${toScalarTextLoose(card.best_channel_to_reach) || "не определён"}`);

  const proofItems = Array.isArray(payload?.meta?.proof_items)
    ? payload.meta.proof_items.filter((item) => item && typeof item === "object")
    : [];
  const targetDomain = getDomainFromUrl(siteUrl);
  const shortEvidence = proofItems
    .filter((item) => {
      const proofUrl = normalizeUrlFromText(item.url);
      return proofUrl && isSameDomainOrSubdomain(proofUrl, targetDomain);
    })
    .slice(0, 8);

  if (shortEvidence.length > 0) {
    lines.push("");
    lines.push("Короткие доказательства с сайта:");
    shortEvidence.forEach((item, index) => {
      const proofUrl = normalizeUrlFromText(item.url);
      const quote = toScalarTextLoose(item.evidence_snippet) || toScalarTextLoose(item.signal_value) || "signal";
      lines.push(`${index + 1}. ${quote}${proofUrl ? ` (${proofUrl})` : ""}`);
    });
  }

  return lines.join("\n");
};

const renderEmelyanMain = ({ payload }) => {
  const safe = payload && typeof payload === "object" ? payload : {};
  const sequences = Array.isArray(safe.email_sequences)
    ? safe.email_sequences
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
    : [];
  const meta = safe.meta && typeof safe.meta === "object" ? safe.meta : {};
  const firstSequence = sequences[0] || {};
  const emails = Array.isArray(firstSequence.emails)
    ? firstSequence.emails.map((item) => (item && typeof item === "object" ? item : null)).filter(Boolean)
    : [];
  const primary = emails[0] || {};
  const followups = emails.slice(1, 3);
  const alternatives = sequences.slice(1, 3).map((sequence) => {
    const seqEmails = Array.isArray(sequence?.emails) ? sequence.emails : [];
    return seqEmails[0] && typeof seqEmails[0] === "object" ? seqEmails[0] : null;
  }).filter(Boolean);
  const clarifying = Array.isArray(meta.clarifying_questions)
    ? meta.clarifying_questions.map((item) => toScalarTextLoose(item)).filter(Boolean).slice(0, 3)
    : [];

  const lines = [];
  lines.push("1) Готовый вариант");
  lines.push(`Тема: ${toScalarTextLoose(primary.subject) || "Короткий вопрос по инвестициям"}`);
  lines.push(
    `Прехедер: ${toScalarTextLoose(primary.preview_line) || "Коротко по задаче и предложению без лишней теории."}`
  );
  lines.push("");
  lines.push(toScalarTextLoose(primary.body) || "Черновик письма сформирован по запросу пользователя.");
  lines.push("");
  lines.push(`CTA: ${toScalarTextLoose(primary.cta) || "Подходит, чтобы обсудить 10-минутный слот?"}`);

  lines.push("");
  lines.push("2) Две альтернативы");
  if (alternatives.length === 0) {
    lines.push("1. Короткая версия: Сделаю версию на 4-6 строк для первого касания.");
    lines.push("2. Жесткая версия: Сделаю вариант с прямым вопросом и конкретным CTA.");
  } else {
    alternatives.slice(0, 2).forEach((item, index) => {
      lines.push(`${index + 1}. ${toScalarTextLoose(item.subject) || "Альтернатива"}`);
      lines.push(`- ${toScalarTextLoose(item.body) || "Текст черновика."}`);
      lines.push(`- CTA: ${toScalarTextLoose(item.cta) || "Актуально обсудить?"}`);
    });
  }

  lines.push("");
  lines.push("3) Follow-up (2 шт.)");
  if (followups.length === 0) {
    lines.push("1. Мягкое напоминание через 2 дня.");
    lines.push("2. Финальный follow-up через 5 дней с коротким кейсом.");
  } else {
    followups.forEach((item, index) => {
      const dayOffset = Number.isFinite(Number(item.day_offset)) ? Number(item.day_offset) : index + 2;
      lines.push(`${index + 1}. День ${dayOffset}: ${toScalarTextLoose(item.subject) || "Follow-up"}`);
      lines.push(`- ${toScalarTextLoose(item.body) || "Короткое напоминание."}`);
      lines.push(`- CTA: ${toScalarTextLoose(item.cta) || "Есть смысл продолжить?"}`);
    });
  }

  if (clarifying.length > 0) {
    lines.push("");
    lines.push("Уточнения (опционально):");
    clarifying.forEach((question, index) => {
      lines.push(`${index + 1}. ${question}`);
    });
  }

  return lines.join("\n");
};

const renderCompetitorFastMain = (payload) => {
  const competitors = Array.isArray(payload?.competitors)
    ? payload.competitors
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (competitors.length === 0) {
    return "Соберу 5–8 конкурентов после уточнения ниши или примера клиента.";
  }
  return competitors
    .map((item, index) => {
      const name =
        sanitizeOutputText(item.name || item.company_name || item.title || "", 140) ||
        `Конкурент ${index + 1}`;
      const url = normalizeUrlFromText(item.primary_url || item.url || "");
      const why =
        sanitizeOutputText(item.why_competitor || item.summary || "", 260) ||
        "Похожий продукт и пересечение по ICP.";
      return `${index + 1}. ${name}${url ? ` — ${url}` : ""}\n${why}`;
    })
    .join("\n\n");
};

const buildUnifiedDocument = ({ payload, rawText, context = {} }) => {
  const role = resolveAgentRole({ name: context.agentName, systemPrompt: context.systemPrompt });
  const taskType = sanitizeOutputText(
    context.requestedTaskType || context.routingDecision?.requestedTaskType || role.taskType || "general_support",
    80
  );
  const outOfRole =
    Boolean(context.routingDecision?.outOfRole) ||
    Boolean(payload?.meta?.routing?.out_of_role_but_completed);
  const summaryLines = collectSummaryLines(payload, rawText);
  const summary = summaryLines[0] || "Готово.";
  const nextSteps = collectNextSteps(payload, taskType).slice(0, 3);
  const company = pickCompanyFields(payload, context);

  let resultText = "";
  if (taskType === "company_analysis" && payload && typeof payload === "object") {
    resultText = renderCompanyAnalysisMain({ payload, companyWebsite: company.companyWebsite });
  } else if (taskType === "competitor_search_fast" && payload && typeof payload === "object") {
    resultText = renderCompetitorFastMain(payload);
  } else if (
    (taskType === "outreach_copy" || taskType === "outreach_sequence" || taskType === "pitch_text") &&
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.email_sequences)
  ) {
    resultText = renderEmelyanMain({ payload });
  } else if (payload && typeof payload === "object") {
    resultText = renderStructuredValue(payload);
  } else if (rawText) {
    resultText = rawText;
  } else {
    resultText = "Сформировал best-effort результат. Для точности нужен дополнительный контекст.";
  }

  const lines = [summary, "", resultText];
  if (outOfRole) {
    const recommendedName =
      sanitizeOutputText(context.recommendedRouting?.agentName, 180) ||
      sanitizeOutputText(payload?.meta?.routing?.recommended_agent_name, 180) ||
      "профильный агент";
    lines.unshift(`Задача не по роли: передал на ${recommendedName}.`);
  }
  if (nextSteps.length > 0) {
    lines.push("");
    nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  return sanitizeOutputText(lines.join("\n"));
};

const isAlreadyStructuredResponse = (text) => {
  const safe = sanitizeOutputText(text).toLowerCase();
  if (!safe) return false;
  return safe.includes("краткое резюме") || safe.includes("output:") || safe.includes("основная часть");
};

const CHAT_FORBIDDEN_PATTERNS = [
  /account card/i,
  /pricing evidence/i,
  /comparison table/i,
  /\boutput:/i,
  /краткое резюме/i,
  /основная часть/i,
  /нет данных/i,
  /email sequences:/i,
  /\.\.\.ещ[её]/i,
  /ещ[её]\s+полей/i
];

const YAML_LIKE_PATTERN = /^\s*[\w.-]+\s*:\s*$/m;

const sanitizeUserFacingChatText = (text) => {
  let safe = sanitizeOutputText(text);
  if (!safe) return "";
  safe = safe
    .replace(/^краткое резюме\s*$/gim, "")
    .replace(/^основная часть\s*$/gim, "")
    .replace(/^output:\s*$/gim, "")
    .replace(/\[Ответ сокращён по лимиту режима\]/gi, "")
    .replace(/\bнет данных\b/gi, "недостаточно подтвержденных данных")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return safe;
};

const validateUserFacingChatText = ({ text, taskType, roleKey }) => {
  const safe = sanitizeOutputText(text);
  const errors = [];
  if (!safe) errors.push("empty_chat_response");
  CHAT_FORBIDDEN_PATTERNS.forEach((pattern) => {
    if (pattern.test(safe)) errors.push(`forbidden_pattern:${pattern.source}`);
  });
  if (YAML_LIKE_PATTERN.test(safe)) {
    errors.push("yaml_like_response");
  }
  if (
    roleKey === "ROLE_03" &&
    taskType === "competitor_search_fast" &&
    /(offer|позиционирован|battlecard|батлкард)/i.test(safe)
  ) {
    errors.push("competitor_fast_contains_strategy");
  }
  return { ok: errors.length === 0, errors };
};

const formatOutput = (output, context = {}) => {
  const payload =
    output && typeof output === "object" && output.data
      ? output.data
      : output;

  if (typeof payload === "string") {
    const parsed = tryParseJsonString(payload);
    if (parsed && typeof parsed === "object") {
      return sanitizeUserFacingChatText(
        clampAssistantText(buildUnifiedDocument({ payload: parsed, rawText: "", context }))
      );
    }
    const plain = sanitizeOutputText(payload);
    if (!plain) return "Сформировал ответ, но не получил содержимого для показа.";
    if (isAlreadyStructuredResponse(plain)) {
      return sanitizeUserFacingChatText(clampAssistantText(plain));
    }
    return sanitizeUserFacingChatText(
      clampAssistantText(
        buildUnifiedDocument({
          payload: null,
          rawText: plain,
          context
        })
      )
    );
  }

  if (payload && typeof payload === "object") {
    return sanitizeUserFacingChatText(
      clampAssistantText(
        buildUnifiedDocument({
          payload,
          rawText: "",
          context
        })
      )
    );
  }

  const fallback = sanitizeOutputText(String(payload ?? ""));
  if (!fallback) return "Сформировал ответ, но не получил содержимого для показа.";
  return sanitizeUserFacingChatText(
    clampAssistantText(
      buildUnifiedDocument({
        payload: null,
        rawText: fallback,
        context
      })
    )
  );
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

const extractArtemArtifactsFromOutput = ({ runnerKey, output }) => {
  if (runnerKey !== "artem-hot-leads-ru") return null;
  const payload =
    output && typeof output === "object" && output.data
      ? output.data
      : output;
  if (!payload || typeof payload !== "object") return null;

  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const rawLeads = Array.isArray(payload.hot_leads) ? payload.hot_leads : [];
  const debug = meta.search_debug && typeof meta.search_debug === "object" ? meta.search_debug : {};
  const searchQueries = Array.isArray(debug.searchQueries)
    ? debug.searchQueries.map((item) => sanitizeText(item, 240)).filter(Boolean)
    : [];
  const intentJson =
    debug.intent_json && typeof debug.intent_json === "object" ? debug.intent_json : null;
  const totalTokens = Number.isFinite(Number(debug.total_tokens))
    ? Number(debug.total_tokens)
    : Number.isFinite(Number(meta.lead_stats?.llm_tokens_total))
      ? Number(meta.lead_stats.llm_tokens_total)
      : 0;
  const negativeKeywords = Array.isArray(debug.negative_keywords)
    ? debug.negative_keywords.map((item) => sanitizeText(item, 80)).filter(Boolean)
    : Array.isArray(meta.negative_keywords)
      ? meta.negative_keywords.map((item) => sanitizeText(item, 80)).filter(Boolean)
      : [];
  const filteredIrrelevantCount = Number.isFinite(Number(debug.filtered_irrelevant_count))
    ? Number(debug.filtered_irrelevant_count)
    : Number.isFinite(Number(meta.lead_stats?.filtered_irrelevant_count))
      ? Number(meta.lead_stats.filtered_irrelevant_count)
      : 0;
  const filteredReasons =
    debug.filtered_reasons && typeof debug.filtered_reasons === "object"
      ? Object.fromEntries(
          Object.entries(debug.filtered_reasons)
            .map(([reason, count]) => [sanitizeText(reason, 120), Number(count || 0)])
            .filter(([reason, count]) => Boolean(reason) && Number.isFinite(count) && count > 0)
        )
      : {};
  const sourceCategories =
    debug.source_categories && typeof debug.source_categories === "object"
      ? Object.fromEntries(
          Object.entries(debug.source_categories)
            .map(([kind, count]) => [sanitizeText(kind, 80), Number(count || 0)])
            .filter(([kind, count]) => Boolean(kind) && Number.isFinite(count) && count > 0)
        )
      : {};
  const droppedArticlesForums = Number.isFinite(Number(debug.dropped_articles_forums))
    ? Number(debug.dropped_articles_forums)
    : Number.isFinite(Number(meta.lead_stats?.dropped_articles_forums))
      ? Number(meta.lead_stats.dropped_articles_forums)
      : 0;
  const webSearch =
    debug.web_search && typeof debug.web_search === "object"
      ? {
          enabled: Boolean(debug.web_search.enabled),
          reason: sanitizeText(debug.web_search.reason, 160),
          provider: sanitizeText(debug.web_search.provider, 120)
        }
      : null;
  const geoScope = sanitizeText(debug.geo_scope || meta.search_plan?.geo_scope, 60) || "cis";
  const geoDropCount = Number.isFinite(Number(debug.geo_drop_count))
    ? Number(debug.geo_drop_count)
    : 0;
  const geoDropExamples = Array.isArray(debug.geo_drop_examples)
    ? debug.geo_drop_examples
        .map((item) => (item && typeof item === "object" ? item : null))
        .filter(Boolean)
        .slice(0, 10)
        .map((item) => ({
          domain: sanitizeText(item?.domain, 120),
          reason: sanitizeText(item?.reason, 220),
          url: sanitizeText(item?.url, 400)
        }))
    : [];
  const candidatesFromInput = Number.isFinite(Number(debug.candidates_from_input))
    ? Number(debug.candidates_from_input)
    : Number.isFinite(Number(meta.rank_provided_list?.candidates_from_input))
      ? Number(meta.rank_provided_list.candidates_from_input)
      : 0;
  const vendorFilteredCount = Number.isFinite(Number(debug.vendor_filtered_count))
    ? Number(debug.vendor_filtered_count)
    : 0;
  const entityRoleCounts =
    debug.entity_role_counts && typeof debug.entity_role_counts === "object"
      ? Object.fromEntries(
          Object.entries(debug.entity_role_counts)
            .map(([role, count]) => [sanitizeText(role, 40), Number(count || 0)])
            .filter(([role, count]) => Boolean(role) && Number.isFinite(count) && count > 0)
        )
      : {};
  const searchTarget = sanitizeText(debug.search_target, 40) || "buyer_only";
  const searchCalls = Array.isArray(debug.calls)
    ? debug.calls
        .map((call) => (call && typeof call === "object" ? call : null))
        .filter(Boolean)
    : [];
  const llmCalls = Array.isArray(debug.llm_calls)
    ? debug.llm_calls
        .map((call) => (call && typeof call === "object" ? call : null))
        .filter(Boolean)
    : [];

  const leads = rawLeads
    .map((lead, index) => {
      const safe = lead && typeof lead === "object" ? lead : {};
      const url = sanitizeText(safe.url, 500);
      const normalizedUrl = url ? canonicalizeUrl(url) : "";
      const confidence = Number(safe.confidence);
      return {
        rank: index + 1,
        title: sanitizeText(safe.title, 220) || "Без названия",
        company_or_organization: sanitizeText(
          safe.company_or_organization || safe.company || "",
          160
        ),
        who: sanitizeText(safe.who, 180),
        url,
        normalized_url: normalizedUrl,
        source: sanitizeText(safe.source, 80) || "web",
        source_type: sanitizeText(safe.source_type || safe.source_kind, 40),
        entity_role: sanitizeText(safe.entity_role, 40),
        geo: sanitizeText(safe.geo_hint, 80),
        snippet: sanitizeText(safe.request_summary, 260),
        evidence: sanitizeText(safe.evidence, 260) || sanitizeText(safe.request_summary, 260),
        why_match:
          sanitizeText(safe.why_match, 260) ||
          (Array.isArray(safe.hot_reasons)
            ? sanitizeText(safe.hot_reasons.join("; "), 260)
            : ""),
        why_now: sanitizeText(safe.why_now, 260),
        contact_hint: sanitizeText(safe.contact_hint, 260),
        where_to_contact: sanitizeText(safe.where_to_contact, 260),
        lead_type:
          sanitizeText(safe.lead_type, 20) || (safe.is_hot_lead ? "Hot" : "Warm"),
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(100, Math.round(confidence)))
          : Math.max(0, Math.min(100, Math.round(Number(safe.hot_score || 0)))),
        search_query_index: Number.isFinite(Number(safe.search_query_index))
          ? Number(safe.search_query_index)
          : null
      };
    })
    .filter((item) => item && item.title);

  return {
    status_code: sanitizeText(meta.status_code, 80) || "OK",
    leads,
    search_debug: {
      queries: searchQueries,
      intent_json: intentJson,
      total_tokens: totalTokens,
      negative_keywords: negativeKeywords,
      filtered_irrelevant_count: filteredIrrelevantCount,
      filtered_reasons: filteredReasons,
      source_categories: sourceCategories,
      dropped_articles_forums: droppedArticlesForums,
      web_search: webSearch,
      geo_scope: geoScope,
      geo_drop_count: geoDropCount,
      geo_drop_examples: geoDropExamples,
      search_target: searchTarget,
      candidates_from_input: candidatesFromInput,
      vendor_filtered_count: vendorFilteredCount,
      entity_role_counts: entityRoleCounts,
      llm_not_called: Boolean(debug.llm_not_called),
      models_per_step:
        debug.models_per_step && typeof debug.models_per_step === "object"
          ? Object.fromEntries(
              Object.entries(debug.models_per_step)
                .map(([step, model]) => [sanitizeText(step, 120), sanitizeText(model, 120)])
                .filter(([step, model]) => Boolean(step) && Boolean(model))
            )
          : {},
      calls: searchCalls.map((call) => ({
        query: sanitizeText(call.query, 240),
        query_index: Number.isFinite(Number(call.query_index)) ? Number(call.query_index) : null,
        provider: sanitizeText(call.provider, 80),
        fetched_at: sanitizeText(call.fetched_at, 80),
        duration_ms: Number.isFinite(Number(call.duration_ms)) ? Number(call.duration_ms) : null,
        status: sanitizeText(call.status, 40),
        error: sanitizeText(call.error, 220),
        usage_tokens: Number.isFinite(Number(call.usage_tokens)) ? Number(call.usage_tokens) : null,
        results_count: Number.isFinite(Number(call.results_count)) ? Number(call.results_count) : 0,
        sample_urls: Array.isArray(call.sample_urls)
          ? call.sample_urls.map((item) => sanitizeText(item, 320)).filter(Boolean).slice(0, 10)
          : []
      })),
      llm_calls: llmCalls.map((call) => ({
        step: sanitizeText(call.step, 120) || "LLM_STEP",
        provider: sanitizeText(call.provider, 80),
        model: sanitizeText(call.model, 120),
        fetched_at: sanitizeText(call.fetched_at, 80),
        duration_ms: Number.isFinite(Number(call.duration_ms)) ? Number(call.duration_ms) : null,
        status: sanitizeText(call.status, 40) || "OK",
        error: sanitizeText(call.error, 220),
        prompt_tokens: Number.isFinite(Number(call.prompt_tokens)) ? Number(call.prompt_tokens) : 0,
        completion_tokens: Number.isFinite(Number(call.completion_tokens))
          ? Number(call.completion_tokens)
          : 0,
        total_tokens: Number.isFinite(Number(call.total_tokens)) ? Number(call.total_tokens) : 0,
        items_count: Number.isFinite(Number(call.items_count)) ? Number(call.items_count) : null
      }))
    }
  };
};

const extractCompanyAnalysisDebugFromOutput = ({ runnerKey, output }) => {
  if (runnerKey !== "anatoly") return null;
  const payload =
    output && typeof output === "object" && output.data
      ? output.data
      : output;
  if (!payload || typeof payload !== "object") return null;
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : null;
  if (!meta) return null;
  return {
    target_domain: sanitizeText(meta.target_domain, 120),
    primary_url: sanitizeText(meta.primary_url, 400),
    web_stats: meta.web_stats || null,
    limitations: Array.isArray(meta.limitations)
      ? meta.limitations.map((item) => sanitizeText(item, 240)).filter(Boolean)
      : [],
    assumptions: Array.isArray(meta.assumptions)
      ? meta.assumptions.map((item) => sanitizeText(item, 240)).filter(Boolean)
      : [],
    seed_urls: Array.isArray(meta.seed_urls)
      ? meta.seed_urls.map((item) => sanitizeText(item, 400)).filter(Boolean).slice(0, 20)
      : [],
    external_context: Array.isArray(meta.external_context)
      ? meta.external_context
          .map((item) => (item && typeof item === "object" ? item : null))
          .filter(Boolean)
          .slice(0, 10)
      : []
  };
};

const persistArtemRunArtifacts = async ({
  taskId,
  agentId,
  runnerKey,
  output
}) => {
  if (runnerKey !== "artem-hot-leads-ru") return;
  if (!prisma.searchQuery || !prisma.searchResultRaw || !prisma.lead) return;

  const artifacts = extractArtemArtifactsFromOutput({ runnerKey, output });
  if (!artifacts) return;

  const envelopeMeta =
    output && typeof output === "object" && output.meta && typeof output.meta === "object"
      ? output.meta
      : {};
  const runId = sanitizeText(envelopeMeta.run_id, 120) || randomUUID();

  try {
    const queryIdByIndex = new Map();
    for (const call of artifacts.search_debug.calls) {
      const createdQuery = await prisma.searchQuery.create({
        data: {
          taskId,
          runId,
          agentId,
          query: sanitizeText(call.query, 500),
          provider: sanitizeText(call.provider, 120) || "unknown",
          source: "",
          geo: "",
          limit: null,
          usageTokens: call.usage_tokens,
          status: sanitizeText(call.status, 40) || "ERROR",
          errorText: sanitizeText(call.error, 1000) || null,
          fetchedAt: call.fetched_at ? new Date(call.fetched_at) : new Date()
        }
      });

      if (Number.isFinite(call.query_index)) {
        queryIdByIndex.set(Number(call.query_index), createdQuery.id);
      }

      await prisma.searchResultRaw.create({
        data: {
          taskId,
          runId,
          agentId,
          queryId: createdQuery.id,
          provider: sanitizeText(call.provider, 120) || "unknown",
          fetchedAt: call.fetched_at ? new Date(call.fetched_at) : new Date(),
          rawJson: JSON.stringify({
            status: call.status,
            error: call.error,
            sample_urls: call.sample_urls
          }),
          resultsCount: Number.isFinite(Number(call.results_count))
            ? Number(call.results_count)
            : 0
        }
      });
    }

    if (Array.isArray(artifacts.search_debug.llm_calls)) {
      for (const llmCall of artifacts.search_debug.llm_calls) {
        const stepName = sanitizeText(llmCall.step, 120) || "LLM_STEP";
        const createdQuery = await prisma.searchQuery.create({
          data: {
            taskId,
            runId,
            agentId,
            query: `[LLM] ${stepName}`,
            provider: sanitizeText(llmCall.provider, 120) || "llm",
            source: "",
            geo: "",
            limit: null,
            usageTokens: Number.isFinite(Number(llmCall.total_tokens))
              ? Number(llmCall.total_tokens)
              : null,
            status: sanitizeText(llmCall.status, 40) || "ERROR",
            errorText: sanitizeText(llmCall.error, 1000) || null,
            fetchedAt: llmCall.fetched_at ? new Date(llmCall.fetched_at) : new Date()
          }
        });

        await prisma.searchResultRaw.create({
          data: {
            taskId,
            runId,
            agentId,
            queryId: createdQuery.id,
            provider: sanitizeText(llmCall.provider, 120) || "llm",
            fetchedAt: llmCall.fetched_at ? new Date(llmCall.fetched_at) : new Date(),
            rawJson: JSON.stringify({
              step: stepName,
              model: llmCall.model || "",
              status: llmCall.status || "OK",
              error: llmCall.error || "",
              prompt_tokens: Number(llmCall.prompt_tokens || 0),
              completion_tokens: Number(llmCall.completion_tokens || 0),
              total_tokens: Number(llmCall.total_tokens || 0),
              items_count: Number(llmCall.items_count || 0)
            }),
            resultsCount: Number.isFinite(Number(llmCall.items_count))
              ? Number(llmCall.items_count)
              : 0
          }
        });
      }
    }

    for (const lead of artifacts.leads) {
      if (!sanitizeText(lead.url, 500)) {
        continue;
      }
      const queryId =
        Number.isFinite(Number(lead.search_query_index))
          ? queryIdByIndex.get(Number(lead.search_query_index)) || null
          : null;

      await prisma.lead.create({
        data: {
          taskId,
          runId,
          agentId,
          title: sanitizeText(lead.title, 220) || "Без названия",
          url: sanitizeText(lead.url, 500),
          normalizedUrl: sanitizeText(lead.normalized_url, 500) || sanitizeText(lead.url, 500),
          source: sanitizeText(lead.source, 80) || "web",
          geo: sanitizeText(lead.geo, 80) || null,
          snippet: sanitizeText(lead.snippet, 1200) || null,
          whyMatch: sanitizeText(lead.why_match, 1200) || null,
          contactHint: sanitizeText(lead.contact_hint, 1200) || null,
          confidence: Math.max(0, Math.min(100, Number(lead.confidence || 0))),
          searchQueryId: queryId
        }
      });
    }
  } catch {
    // keep chat flow resilient if DB artifacts are not initialized yet
  }
};

const runAgentReply = async ({
  runnerKey,
  text,
  requestedTaskType,
  routingDecision,
  mode,
  target,
  geoScope,
  toolsEnabled,
  forceNoWeb,
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

  const rawInput = buildAgentInput(runnerKey, text, toolsEnabled, {
    mode,
    target,
    geoScope,
    requestedTaskType,
    routingDecision
  });
  const input = applyRoleLockToInput({
    input: rawInput,
    toolsEnabled: Boolean(toolsEnabled) && !forceNoWeb,
    routingDecision
  });
  const requestedMaxWebRequests = Number(input?.max_web_requests);
  const maxWebRequests =
    Number.isFinite(requestedMaxWebRequests) && requestedMaxWebRequests > 0
      ? Math.round(requestedMaxWebRequests)
      : 100;
  const requestedMaxVisitedDomains = Number(input?.max_visited_domains);
  const maxVisitedDomains =
    Number.isFinite(requestedMaxVisitedDomains) && requestedMaxVisitedDomains > 0
      ? Math.round(requestedMaxVisitedDomains)
      : null;
  const webClient =
    runner.isWeb && !forceNoWeb && toolsEnabled
      ? new WebClient({ maxRequests: maxWebRequests, maxVisitedDomains })
      : null;
  const provider = sanitizeText(process.env.SEARCH_PROVIDER || "", 80).toLowerCase();
  const hasSearchProvider =
    provider === "serpapi"
      ? Boolean(sanitizeText(process.env.SEARCH_API_KEY || "", 200))
      : provider === "webclient";
  const enableSearchForRun = toolsEnabled && !forceNoWeb && hasSearchProvider;
  const searchClient = {
    search: async ({ query, limit, geo, source } = {}) => {
      try {
        return await searchWeb({ query, limit, geo, source });
      } catch (error) {
        if (error instanceof SearchProviderError) {
          return {
            ok: false,
            provider: "search-api",
            status: error.status || 500,
            error: error.code || "SEARCH_PROVIDER_ERROR",
            message: error.message,
            details: error.details || null,
            results: [],
            usage_tokens: null
          };
        }
        return {
          ok: false,
          provider: "search-api",
          status: 500,
          error: "SEARCH_PROVIDER_ERROR",
          message: error instanceof Error ? error.message : "Search failed",
          results: [],
          usage_tokens: null
        };
      }
    }
  };
  const runFn = (payload) =>
    runner.run(payload, {
      webClient,
      searchClient: enableSearchForRun ? searchClient : null,
      webSearchEnabled: enableSearchForRun,
      searchProvider: provider || "none",
      allowWebClientSearch: enableSearchForRun && provider === "webclient"
    });

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
  saveToKnowledge,
  mode,
  target,
  geoScope
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
  const requestedTaskType = detectTaskType(safeContent);
  const routingRuntime = runnerKey
    ? await buildRoutingRuntime({
        workspaceId,
        agent,
        runnerKey,
        taskType: requestedTaskType,
        mode,
        userText: safeContent
      })
    : { decision: null, recommended: null };
  const toolsEnabled = true;
  const knowledgeEnabled = true;

  let assistantContent = "";
  let assistantOutput = null;
  let status = "success";
  let errorText = null;

  if (!runnerKey) {
    status = "error";
    errorText = "Runner is not configured for this agent.";
    assistantContent =
      "Ошибка: для этого агента пока не настроен раннер. Что сделать: проверьте имя агента и сопоставление в chat runtime.";
  } else if (routingRuntime.decision?.outOfRole) {
    const handoff = routingRuntime.recommended;
    if (handoff?.runnerKey && handoff?.decision) {
      try {
        let output = await runAgentReply({
          runnerKey: handoff.runnerKey,
          text: textForRun,
          requestedTaskType,
          routingDecision: handoff.decision,
          mode,
          target,
          geoScope,
          toolsEnabled,
          forceNoWeb: false,
          knowledgeEnabled,
          workspaceId,
          knowledgeAgentId: handoff.agentId || agent.id
        });
        output = applyOutputItemGuards({
          output,
          taskType: requestedTaskType
        });
        assistantOutput = output;
        assistantContent = formatOutput(output, {
          agentName: handoff.agentName || handoff.runnerDisplayName || agent.name,
          runnerKey: handoff.runnerKey,
          userPrompt: safeContent,
          requestedTaskType,
          routingDecision: handoff.decision,
          recommendedRouting: null
        });
        assistantContent = sanitizeUserFacingChatText(assistantContent);
        assistantContent = `Переключил задачу на ${sanitizeOutputText(
          handoff.agentName || handoff.runnerDisplayName || "профильный агент",
          180
        )}.\n\n${assistantContent}`;
      } catch (handoffError) {
        assistantContent = buildOutOfRoleUserResponse({
          agentName: agent.name,
          decision: routingRuntime.decision,
          requestedTaskType,
          recommended: routingRuntime.recommended,
          userPrompt: safeContent
        });
      }
    } else {
      assistantContent = buildOutOfRoleUserResponse({
        agentName: agent.name,
        decision: routingRuntime.decision,
        requestedTaskType,
        recommended: routingRuntime.recommended,
        userPrompt: safeContent
      });
    }
  } else {
    try {
      let output = await runAgentReply({
        runnerKey,
        text: textForRun,
        requestedTaskType,
        routingDecision: routingRuntime.decision,
        mode,
        target,
        geoScope,
        toolsEnabled,
        forceNoWeb: false,
        knowledgeEnabled,
        workspaceId,
        knowledgeAgentId: agent.id
      });

      output = applyOutputItemGuards({
        output,
        taskType: requestedTaskType
      });

      const validation = validateRoleLockedOutput({
        taskType: requestedTaskType,
        output,
        userPrompt: safeContent
      });

      if (!validation.ok) {
        const retryInstruction = [
          textForRun,
          "",
          "SYSTEM VALIDATION FIX:",
          "Исправь только нарушенные правила без расширения scope.",
          `Ошибки: ${validation.errors.join(", ")}.`,
          "Запрещено делать новые web-запросы, используй уже собранные данные."
        ].join("\n");

        output = await runAgentReply({
          runnerKey,
          text: retryInstruction,
          requestedTaskType,
          routingDecision: routingRuntime.decision,
          mode,
          target,
          geoScope,
          toolsEnabled,
          forceNoWeb: true,
          knowledgeEnabled: false,
          workspaceId,
          knowledgeAgentId: agent.id
        });
        output = applyOutputItemGuards({
          output,
          taskType: requestedTaskType
        });
      }

      assistantOutput = output;
      assistantContent = formatOutput(output, {
        agentName: agent.name,
        runnerKey,
        userPrompt: safeContent,
        requestedTaskType,
        routingDecision: routingRuntime.decision,
        recommendedRouting: routingRuntime.recommended
      });
      assistantContent = sanitizeUserFacingChatText(
        clampByChars(
          assistantContent,
          Number(routingRuntime.decision?.maxOutputChars || 12000)
        )
      );
      const userFacingValidation = validateUserFacingChatText({
        text: assistantContent,
        taskType: requestedTaskType,
        roleKey: routingRuntime.decision?.roleKey || ""
      });
      if (!userFacingValidation.ok) {
        const retryInstruction = [
          textForRun,
          "",
          "SYSTEM FORMAT FIX:",
          "Перепиши ответ в user-chat формате: 1 строка резюме + результат + 1-3 next steps.",
          "Запрещено: YAML/JSON, OUTPUT, 'Краткое резюме', 'Основная часть', 'нет данных', debug-блоки.",
          `Нарушения: ${userFacingValidation.errors.join(", ")}.`,
          "Не делай новые web-запросы."
        ].join("\n");

        output = await runAgentReply({
          runnerKey,
          text: retryInstruction,
          requestedTaskType,
          routingDecision: routingRuntime.decision,
          mode,
          target,
          geoScope,
          toolsEnabled,
          forceNoWeb: true,
          knowledgeEnabled: false,
          workspaceId,
          knowledgeAgentId: agent.id
        });
        output = applyOutputItemGuards({
          output,
          taskType: requestedTaskType
        });
        assistantOutput = output;
        assistantContent = sanitizeUserFacingChatText(
          formatOutput(output, {
            agentName: agent.name,
            runnerKey,
            userPrompt: safeContent,
            requestedTaskType,
            routingDecision: routingRuntime.decision,
            recommendedRouting: routingRuntime.recommended
          })
        );
      }
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

  const artemArtifacts = extractArtemArtifactsFromOutput({
    runnerKey,
    output: assistantOutput
  });
  const companyAnalysisDebug = extractCompanyAnalysisDebugFromOutput({
    runnerKey,
    output: assistantOutput
  });
  if (artemArtifacts) {
    await persistArtemRunArtifacts({
      taskId: thread.id,
      agentId,
      runnerKey,
      output: assistantOutput
    });
  }

  const assistantMeta = {};
  if (knowledgeAdded > 0) {
    assistantMeta.knowledge_added = knowledgeAdded;
  }
  if (artemArtifacts) {
    assistantMeta.status_code = artemArtifacts.status_code;
    assistantMeta.leads = artemArtifacts.leads;
    assistantMeta.search_debug = artemArtifacts.search_debug;
  }
  if (companyAnalysisDebug) {
    assistantMeta.analysis_debug = companyAnalysisDebug;
  }
  if (routingRuntime.decision) {
    assistantMeta.routing = {
      role_key: sanitizeText(routingRuntime.decision.roleKey, 80),
      allowed_task_types: Array.isArray(routingRuntime.decision.allowedTaskTypes)
        ? routingRuntime.decision.allowedTaskTypes.map((item) => sanitizeText(item, 80)).filter(Boolean)
        : [],
      requested_task_type: sanitizeText(routingRuntime.decision.requestedTaskType, 80),
      out_of_role_but_completed: Boolean(routingRuntime.decision.outOfRole),
      recommended_runner_key: sanitizeText(routingRuntime.decision.recommendedRunnerKey, 80),
      recommended_agent_name: sanitizeText(
        routingRuntime.recommended?.agentName || routingRuntime.recommended?.runnerDisplayName || "",
        180
      ),
      recommended_agent_id: sanitizeText(routingRuntime.recommended?.agentId || "", 180),
      transfer_available: Boolean(
        routingRuntime.decision.outOfRole && routingRuntime.recommended?.agentId
      )
    };
  }

  await prisma.taskMessage.create({
    data: {
      taskId: thread.id,
      userId: workspaceId,
      role: "agent",
      agentId,
      content: assistantContent,
      meta: Object.keys(assistantMeta).length > 0 ? JSON.stringify(assistantMeta) : "{}"
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
  resolveRunnerKeyFromAgentName,
  __testOnly: {
    formatOutput,
    validateUserFacingChatText,
    sanitizeUserFacingChatText,
    normalizeUrlFromText,
    collectCompanyAnalysisSources
  }
};
