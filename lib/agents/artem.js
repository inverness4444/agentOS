const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const { stableTextFingerprint } = require("../../utils/scoring.js");
const { extractFromHtml } = require("../../extractors");

const inputDefaults = {
  mode: "deep",
  has_web_access: true,
  max_web_requests: null,
  focus: "mixed",
  geo: "Россия",
  keywords: [],
  include_sources: {
    vk: true,
    telegram: true,
    maps_reviews: true,
    websites_forms: false
  },
  time_window_days: 30,
  target_count: null,
  min_hot_score: 60,
  require_proof: true,
  allow_placeholders_if_blocked: true,
  inbox_texts: [],
  exclude_domains: [],
  exclude_urls: [],
  dedupe_by: "mixed"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep", "continue", "refresh"], default: "deep" },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    focus: {
      type: "string",
      enum: ["wb_ozon", "marketing", "automation", "chatbots", "crm", "mixed"],
      default: "mixed"
    },
    geo: { type: "string", default: "Россия" },
    keywords: { type: "array", items: { type: "string" } },
    include_sources: {
      type: "object",
      properties: {
        vk: { type: "boolean", default: true },
        telegram: { type: "boolean", default: true },
        maps_reviews: { type: "boolean", default: true },
        websites_forms: { type: "boolean", default: false }
      }
    },
    time_window_days: { type: "number", default: 30 },
    target_count: { type: "number" },
    min_hot_score: { type: "number", default: 60 },
    require_proof: { type: "boolean", default: true },
    allow_placeholders_if_blocked: { type: "boolean", default: true },
    inbox_texts: { type: "array", items: { type: "string" } },
    exclude_domains: { type: "array", items: { type: "string" } },
    exclude_urls: { type: "array", items: { type: "string" } },
    dedupe_by: {
      type: "string",
      enum: ["url", "thread", "text_fingerprint", "mixed"],
      default: "mixed"
    }
  },
  required: ["mode", "has_web_access"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["hot_leads", "meta"],
  additionalProperties: false,
  properties: {
    hot_leads: { type: "array" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Артём — Hot Leads (RU 'горячие' сигналы)".
Роль: находить горячие сигналы по публичным источникам (VK/Telegram/карты) без серого парсинга.
Не обходи капчи/логины, не используй скрытые API, не собирай персональные данные.`;

const artemAgent = {
  id: "artem-hot-leads-ru",
  displayName: "Артём — Горячие лиды",
  description:
    "Находит горячие публичные сигналы о поиске подрядчиков/помощи по РФ с доказательствами.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: artemAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const sanitizeEvidenceSnippet = (text, max = 160) => sanitizeSnippet(text, max);

const resolveMaxRequests = (mode, maxRequests) => {
  if (typeof maxRequests === "number" && Number.isFinite(maxRequests) && maxRequests > 0) {
    return Math.round(maxRequests);
  }
  return mode === "quick" ? 40 : 100;
};

const resolveTargetCount = (mode, targetCount) => {
  if (typeof targetCount === "number" && Number.isFinite(targetCount) && targetCount > 0) {
    return Math.round(targetCount);
  }
  return mode === "quick" ? 20 : 50;
};

const normalizeKeywords = (keywords) =>
  Array.isArray(keywords)
    ? keywords
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const defaultKeywordsForFocus = (focus) => {
  switch (focus) {
    case "wb_ozon":
      return ["WB", "Ozon", "маркетплейс", "карточки", "фулфилмент"];
    case "marketing":
      return ["маркетинг", "директ", "реклама", "лидоген", "таргет"];
    case "automation":
      return ["автоматизация", "заявки", "процессы", "CRM", "интеграция"];
    case "chatbots":
      return ["чат-бот", "бот", "Telegram бот", "VK бот"];
    case "crm":
      return ["CRM", "Bitrix24", "amoCRM", "1C", "интеграция CRM"];
    case "mixed":
    default:
      return [
        "WB",
        "Ozon",
        "маркетинг",
        "реклама",
        "автоматизация",
        "CRM",
        "чат-бот",
        "лидоген"
      ];
  }
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode =
    safe.mode === "quick" || safe.mode === "continue" || safe.mode === "refresh"
      ? safe.mode
      : "deep";
  const focus = ["wb_ozon", "marketing", "automation", "chatbots", "crm", "mixed"].includes(
    safe.focus
  )
    ? safe.focus
    : "mixed";
  const keywords = normalizeKeywords(safe.keywords);
  const normalized = {
    mode,
    has_web_access: typeof safe.has_web_access === "boolean" ? safe.has_web_access : true,
    max_web_requests: resolveMaxRequests(mode, safe.max_web_requests),
    focus,
    geo: typeof safe.geo === "string" && safe.geo.trim() ? safe.geo.trim() : "Россия",
    keywords: keywords.length ? keywords : defaultKeywordsForFocus(focus),
    include_sources: {
      vk: safe.include_sources?.vk !== false,
      telegram: safe.include_sources?.telegram !== false,
      maps_reviews: safe.include_sources?.maps_reviews !== false,
      websites_forms: safe.include_sources?.websites_forms === true
    },
    time_window_days:
      typeof safe.time_window_days === "number" && Number.isFinite(safe.time_window_days)
        ? Math.max(1, Math.round(safe.time_window_days))
        : 30,
    target_count: resolveTargetCount(mode, safe.target_count),
    min_hot_score:
      typeof safe.min_hot_score === "number" && Number.isFinite(safe.min_hot_score)
        ? Math.max(0, Math.min(100, Math.round(safe.min_hot_score)))
        : 60,
    require_proof: typeof safe.require_proof === "boolean" ? safe.require_proof : true,
    allow_placeholders_if_blocked:
      typeof safe.allow_placeholders_if_blocked === "boolean"
        ? safe.allow_placeholders_if_blocked
        : true,
    inbox_texts: Array.isArray(safe.inbox_texts)
      ? safe.inbox_texts.filter((item) => typeof item === "string" && item.trim())
      : [],
    exclude_domains: Array.isArray(safe.exclude_domains)
      ? safe.exclude_domains.filter((item) => typeof item === "string" && item.trim())
      : [],
    exclude_urls: Array.isArray(safe.exclude_urls)
      ? safe.exclude_urls.filter((item) => typeof item === "string" && item.trim())
      : [],
    dedupe_by: ["url", "thread", "text_fingerprint", "mixed"].includes(safe.dedupe_by)
      ? safe.dedupe_by
      : "mixed"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxWebRequestsPath: ["max_web_requests"],
    maxItemsPaths: [["target_count"]]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const buildSearchPlan = (input) => {
  const queries = [];
  const keywordSet = input.keywords.length ? input.keywords : defaultKeywordsForFocus(input.focus);

  if (input.include_sources.vk) {
    keywordSet.forEach((keyword) => {
      queries.push(
        `site:vk.com (нужен подрядчик|посоветуйте|кто сделает|сколько стоит|настройка|помогите) ${keyword}`
      );
    });
  }

  if (input.include_sources.telegram) {
    keywordSet.forEach((keyword) => {
      queries.push(
        `site:t.me (посоветуйте|кто сделает|нужен|сколько стоит|помогите) ${keyword}`
      );
    });
  }

  if (input.include_sources.maps_reviews) {
    keywordSet.forEach((keyword) => {
      queries.push(
        `site:yandex.ru/maps отзыв (не отвечают|не дозвониться|ужасная доставка|запись) ${keyword} ${input.geo}`
      );
      queries.push(
        `site:2gis.ru отзыв (не отвечают|не дозвониться|ужасная доставка|запись) ${keyword} ${input.geo}`
      );
    });
  }

  return [...new Set(queries.filter(Boolean))];
};

const getSourceType = (url) => {
  const lower = url.toLowerCase();
  if (lower.includes("vk.com")) return "vk";
  if (lower.includes("t.me")) return "telegram";
  if (lower.includes("yandex.ru/maps")) return "maps_yandex";
  if (lower.includes("2gis")) return "maps_2gis";
  return "other";
};

const fingerprintText = (text) => stableTextFingerprint(text);

const extractSnippetByRegex = (text, regex) => {
  const match = regex.exec(text);
  if (!match || match.index == null) return "";
  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + 100);
  return text.slice(start, end);
};

const detectCategoryHint = (text) => {
  const lower = text.toLowerCase();
  if (/wb|wildberries/.test(lower)) return "WB";
  if (/ozon/.test(lower)) return "Ozon";
  if (/bitrix|битрикс/.test(lower)) return "Bitrix24";
  if (/amocrm|amo crm/.test(lower)) return "amoCRM";
  if (/crm/.test(lower)) return "CRM";
  if (/директ/.test(lower)) return "Direct";
  if (/чат-бот|бот/.test(lower)) return "Chatbots";
  return "";
};

const scoreHotSignals = (text, keywords) => {
  const lower = text.toLowerCase();
  let score = 0;
  const reasons = [];
  const proofSignals = [];

  const directRegex = /(кто сделает|нужен(а|о)? подрядчик|ищу( исполнителя)?|посоветуйте|порекомендуйте|нужна помощь|кто может|ищем подрядчика)/i;
  const urgencyRegex = /(срочно|горит|в ближайш(ие|ие)\s*дн|как можно быстрее|нужно к .*?дате)/i;
  const budgetRegex = /(сколько стоит|бюджет|готов(ы)? платить|ценник|стоимость|оплата)/i;
  const retryRegex = /(не работает|не получилось|уже делали|переделать|не помогло|не зашло)/i;
  const ctaRegex = /(в лс|в личк|напишите|киньте контакты|в директ|в личные)/i;
  const negativeReviewRegex = /(не дозвониться|не отвечают|ужасн|запись не работает|доставка ужас)/i;

  if (directRegex.test(text)) {
    score += 35;
    reasons.push("Есть прямой запрос подрядчика/исполнителя.");
    proofSignals.push({ type: "direct_request", regex: directRegex });
  }

  if (urgencyRegex.test(text)) {
    score += 15;
    reasons.push("Упомянута срочность или сроки.");
    proofSignals.push({ type: "urgency", regex: urgencyRegex });
  }

  if (budgetRegex.test(text)) {
    score += 15;
    reasons.push("Есть упоминание бюджета/стоимости.");
    proofSignals.push({ type: "budget", regex: budgetRegex });
  }

  if (retryRegex.test(text) || negativeReviewRegex.test(text)) {
    score += 10;
    reasons.push("Есть признаки проблем/неудачных попыток.");
    proofSignals.push({ type: "retry_or_pain", regex: retryRegex.test(text) ? retryRegex : negativeReviewRegex });
  }

  const specificRegex = new RegExp(
    keywords
      .map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .concat([
        "wb",
        "wildberries",
        "ozon",
        "битрикс",
        "bitrix",
        "amocrm",
        "crm",
        "директ",
        "telegram",
        "vk",
        "1с"
      ])
      .join("|"),
    "i"
  );
  if (specificRegex.test(text)) {
    score += 15;
    reasons.push("Указана конкретика задачи или платформы.");
    proofSignals.push({ type: "specifics", regex: specificRegex });
  }

  if (ctaRegex.test(text)) {
    score += 10;
    reasons.push("Есть CTA на контакт/обратную связь.");
    proofSignals.push({ type: "cta", regex: ctaRegex });
  }

  return {
    score: Math.min(100, score),
    reasons,
    proofSignals
  };
};

const classifyIntent = (text) => {
  const source = String(text || "");
  const lower = source.toLowerCase();
  if (/(кто сделает|ищем подрядчика|нужен подрядчик|нужен исполнитель)/i.test(source)) {
    return "need_vendor";
  }
  if (/(не дозвониться|не отвечают|ужасн|жалоб|плох|не работает|переделать)/i.test(source)) {
    return "complaint_trigger";
  }
  if (/(сколько стоит|бюджет|цена|стоимость)/i.test(source)) {
    return "price_check";
  }
  if (/(как сделать|подскажите|посоветуйте|что выбрать|нужен совет)/i.test(source)) {
    return "need_advice";
  }
  if (/(\?|что|как|почему)/i.test(source) && lower.includes("подскаж")) {
    return "need_advice";
  }
  return "other";
};

const extractRecencyHint = (text) => {
  const source = String(text || "");
  const explicitDate = source.match(/\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/);
  if (explicitDate) return `date_mentioned:${explicitDate[1]}`;
  if (/сегодня/i.test(source)) return "today_mentioned";
  if (/вчера/i.test(source)) return "yesterday_mentioned";
  const daysAgo = source.match(/(\d{1,2})\s*(дн|дня|дней)\s*назад/i);
  if (daysAgo) return `days_ago:${daysAgo[1]}`;
  return "unknown";
};

const buildReplyAngleOptions = (intentClass, privacyRisk) => {
  const safeLeadIn = privacyRisk
    ? "Можно мягко дать вариант решения без ссылки на конкретный комментарий."
    : "Можно сослаться на открытый запрос и предложить шаги.";
  switch (intentClass) {
    case "need_vendor":
      return [
        `Короткий план пилота на 3–5 дней. ${safeLeadIn}`,
        "Предложить мини-аудит и согласовать 1 приоритетную задачу.",
        "Сначала уточнить сроки/объем, потом дать формат старта."
      ];
    case "need_advice":
      return [
        "Сначала дать 1 практичный совет, затем предложить мини-разбор.",
        "Уточнить контекст да/нет и отправить короткий чек-лист.",
        "Предложить 2 варианта решения без давления на продажу."
      ];
    case "complaint_trigger":
      return [
        "Признать боль и предложить анти-кризисный сценарий ответа/процесса.",
        "Сфокусироваться на устранении повторяющейся причины жалобы.",
        "Дать мягкий план стабилизации сервиса без обещаний KPI."
      ];
    case "price_check":
      return [
        "Дать ценовой коридор и объяснить, от чего зависит стоимость.",
        "Предложить бесплатный мини-аудит перед оценкой внедрения.",
        "Уточнить текущий стек, чтобы избежать лишних затрат."
      ];
    default:
      return [
        "Уточнить задачу и предложить 1 безопасный первый шаг.",
        "Дать короткий пример похожего сценария без цифр.",
        "Предложить мини-аудит в формате да/нет."
      ];
  }
};

const buildQualificationQuestion = (intentClass) => {
  switch (intentClass) {
    case "need_vendor":
      return "Нужен запуск в ближайшие 14 дней? (да/нет)";
    case "need_advice":
      return "Хотите сначала бесплатный мини-разбор? (да/нет)";
    case "complaint_trigger":
      return "Проблема повторяется каждую неделю? (да/нет)";
    case "price_check":
      return "Есть утвержденный бюджет на решение? (да/нет)";
    default:
      return "Актуально продолжить диалог по задаче? (да/нет)";
  }
};

const applyLastRun = (input, lastRun) => {
  if (!lastRun || typeof lastRun !== "object") return input;
  const previousData = unwrapLegacy(lastRun);
  const previous = Array.isArray(previousData.hot_leads) ? previousData.hot_leads : [];
  const prevUrls = previous
    .map((lead) => (lead && lead.url ? lead.url : ""))
    .filter(Boolean);
  if (prevUrls.length === 0) return input;
  return {
    ...input,
    exclude_urls: [...input.exclude_urls, ...prevUrls]
  };
};

const buildDedupeKey = (url, text, input) => {
  const canonical = url ? canonicalizeUrl(url) : "";
  if (input.dedupe_by === "url") return canonical ? `url:${canonical}` : `text:${fingerprintText(text)}`;
  if (input.dedupe_by === "thread") {
    if (canonical) {
      const base = canonical.split("?")[0].split("#")[0];
      return `thread:${base}`;
    }
  }
  if (input.dedupe_by === "text_fingerprint") return `text:${fingerprintText(text)}`;
  if (canonical) return `url:${canonical}`;
  return `text:${fingerprintText(text)}`;
};

const buildProofItems = (url, sourceType, signals, text) => {
  const items = [];
  for (const signal of signals) {
    if (items.length >= 3) break;
    const snippet = extractSnippetByRegex(text, signal.regex) || text.slice(0, 160);
    items.push({
      url,
      source_type: sourceType,
      signal_type: signal.type,
      signal_value: signal.type,
      evidence_snippet: sanitizeEvidenceSnippet(snippet)
    });
  }
  if (items.length === 0 && text) {
    items.push({
      url,
      source_type: sourceType,
      signal_type: "text_excerpt",
      signal_value: "excerpt",
      evidence_snippet: sanitizeEvidenceSnippet(text.slice(0, 160))
    });
  }
  return items;
};

const generateHotLeadFromText = (text, url, input) => {
  const signals = scoreHotSignals(text, input.keywords);
  const sourceType = getSourceType(url);
  const proofItems = buildProofItems(url, sourceType, signals.proofSignals, text);
  const summarySnippet = sanitizeEvidenceSnippet(text.slice(0, 200));
  const categoryHint = detectCategoryHint(text);
  const intentClass = classifyIntent(text);
  const privacyRisk = sourceType === "vk" || sourceType === "telegram";
  const recencyHint = extractRecencyHint(text);
  const replyAngleOptions = buildReplyAngleOptions(intentClass, privacyRisk);
  const qualificationQuestion = buildQualificationQuestion(intentClass);
  const suggestedFirstContact = privacyRisk
    ? "Мягкий нейтральный заход: предложить 1 практичный шаг без ссылки на конкретный комментарий."
    : "Коротко уточнить задачу и сроки, предложить быстрый аудит/план на 3–5 дней.";

  const lead = {
    title: categoryHint ? `Ищут подрядчика по ${categoryHint}` : "Горячий запрос подрядчика",
    source: sourceType,
    url,
    geo_hint: input.geo || undefined,
    category_hint: categoryHint || undefined,
    request_summary: summarySnippet,
    hot_score: signals.score,
    intent_class: intentClass,
    hot_reasons: signals.reasons.slice(0, 6),
    reply_angle_options: replyAngleOptions.slice(0, 3),
    qualification_question: qualificationQuestion,
    suggested_first_contact: suggestedFirstContact,
    risk_flags: {
      no_budget_mentioned: !/сколько стоит|бюджет|ценник|стоимость|оплата/i.test(text),
      anonymous_author: true,
      outdated: recencyHint === "unknown",
      privacy_risk: privacyRisk
    },
    recency_hint: recencyHint,
    dedupe_key: "",
    proof_refs: []
  };

  const dedupeKey = buildDedupeKey(url, text, input);
  lead.dedupe_key = dedupeKey;

  return { lead, proofItems };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const webClient = options.webClient;
  const lastData = unwrapLegacy(options.last_run);

  if (!input.has_web_access || !webClient) {
    const legacyOutput = {
      hot_leads: [],
      meta: {
        generated_at: new Date().toISOString(),
        search_plan: { queries_used: [] },
        web_stats: {
          requests_made: 0,
          blocked_count: 0,
          errors_count: 0,
          duration_ms: 0,
          sources_used: {},
          top_errors: [],
          warnings: [],
          trace_summary: {}
        },
        proof_items: [],
        rejected_hot: [],
        limitations: ["Нет веб-доступа для поиска горячих сигналов."],
        assumptions: [],
        quality_checks: {
          no_gray_scraping: true,
          no_fabrication: true,
          dedupe_ok: true
        }
      }
    };
    applyBudgetMeta(legacyOutput.meta, input);
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  const inputWithLastRun = applyLastRun(input, options.last_run);
  const previousQueries =
    input.mode === "continue" &&
    lastData &&
    lastData.meta &&
    lastData.meta.search_plan &&
    Array.isArray(lastData.meta.search_plan.queries_used)
      ? lastData.meta.search_plan.queries_used
      : null;
  const searchQueries =
    previousQueries && previousQueries.length ? previousQueries : buildSearchPlan(inputWithLastRun);
  const search_plan = { queries_used: searchQueries };

  const seedUrls = Array.isArray(lastData?.meta?.seed_urls) && input.mode === "continue"
    ? [...lastData.meta.seed_urls]
    : [];
  const excludeDomains = new Set(input.exclude_domains.map((item) => item.toLowerCase()));
  const excludeUrls = new Set(input.exclude_urls.map((item) => canonicalizeUrl(item)));

  const limit = input.mode === "quick" ? 3 : 6;

  if (seedUrls.length === 0) {
    for (const query of searchQueries) {
      const results = await webClient.search(query, "yandex", limit);
      results.forEach((item) => {
        if (!item.url) return;
        const canonical = canonicalizeUrl(item.url);
        if (excludeUrls.has(canonical)) return;
        try {
          const host = new URL(canonical).hostname.toLowerCase();
          if (excludeDomains.has(host)) return;
        } catch {
          return;
        }
        if (!seedUrls.includes(canonical)) seedUrls.push(canonical);
      });
    }
  }

  const hot_leads = [];
  const proof_items = [];
  const rejected_hot = [];
  const limitations = [];
  const dedupeKeys = new Set();

  const previousLeads = Array.isArray(lastData?.hot_leads) ? lastData.hot_leads : [];
  const previousKeys = new Set(
    previousLeads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
  );
  const maxLeads =
    input.mode === "continue" && previousLeads.length > 0
      ? Math.max(1, input.target_count - previousLeads.length)
      : input.target_count;
  const maxPages = input.mode === "quick" ? 20 : 50;

  for (const url of seedUrls.slice(0, maxPages)) {
    if (hot_leads.length >= maxLeads) break;
    const page = await webClient.fetchPage(url, { type: getSourceType(url) });
    if ("blocked" in page) {
      limitations.push(`Недоступно: ${url}`);
      continue;
    }
    if (!page.text || page.text.trim().length < 10) {
      limitations.push(`JS-only или пустая страница: ${url}`);
      continue;
    }

    const genericExtract = extractFromHtml(page.html || "", page.url);
    const { lead, proofItems } = generateHotLeadFromText(page.text, page.url, input);
    const mergedProofs = [
      ...(Array.isArray(genericExtract.proof_items) ? genericExtract.proof_items : []),
      ...proofItems
    ];

    if (input.require_proof && mergedProofs.length === 0) {
      rejected_hot.push({ url: page.url, reason: "no_proof", hot_score: lead.hot_score });
      continue;
    }

    if (lead.hot_score < input.min_hot_score) {
      rejected_hot.push({ url: page.url, reason: "score_below_min", hot_score: lead.hot_score });
      continue;
    }

    if (previousKeys.has(lead.dedupe_key)) continue;
    if (dedupeKeys.has(lead.dedupe_key)) continue;
    dedupeKeys.add(lead.dedupe_key);

    const proofRefs = [];
    mergedProofs.forEach((item) => {
      proofRefs.push(proof_items.length);
      proof_items.push(item);
    });
    lead.proof_refs = proofRefs;

    hot_leads.push(lead);
  }

  if (input.include_sources.websites_forms && input.inbox_texts.length) {
    input.inbox_texts.forEach((text, index) => {
      if (hot_leads.length >= maxLeads) return;
      const url = `inbox://lead-${index + 1}`;
      const { lead, proofItems } = generateHotLeadFromText(text, url, input);
      if (lead.hot_score < input.min_hot_score) {
        rejected_hot.push({ url, reason: "score_below_min", hot_score: lead.hot_score });
        return;
      }
      if (previousKeys.has(lead.dedupe_key)) return;
      if (dedupeKeys.has(lead.dedupe_key)) return;
      dedupeKeys.add(lead.dedupe_key);
      const proofRefs = [];
      proofItems.forEach((item) => {
        proofRefs.push(proof_items.length);
        proof_items.push(item);
      });
      lead.proof_refs = proofRefs;
      hot_leads.push(lead);
    });
  }

  const stats = webClient.getStats();
  const trace = webClient.getTrace();
  const traceSummary = trace.reduce((acc, item) => {
    const key = `${item.domain}:${item.type}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    hot_leads: hot_leads.sort((a, b) => b.hot_score - a.hot_score),
    meta: {
      generated_at: new Date().toISOString(),
      search_plan,
      seed_urls: seedUrls,
      web_stats: {
        requests_made: stats.requests_made,
        blocked_count: stats.blocked_count,
        errors_count: stats.errors_count,
        duration_ms: stats.duration_ms,
        sources_used: {
          vk: trace.filter((item) => item.type === "vk").length,
          telegram: trace.filter((item) => item.type === "telegram").length,
          maps: trace.filter((item) => item.type === "maps_yandex" || item.type === "maps_2gis").length,
          websites: trace.filter((item) => item.type === "other").length
        },
        top_errors: stats.top_errors || [],
        warnings: stats.warnings || [],
        trace_summary: traceSummary
      },
      proof_items,
      rejected_hot: rejected_hot.slice(0, 20),
      limitations,
      assumptions: [],
      quality_checks: {
        no_gray_scraping: true,
        no_fabrication: proof_items.length > 0,
        dedupe_ok: dedupeKeys.size === hot_leads.length
      }
    }
  };
  applyBudgetMeta(output.meta, input);

  const envelope = wrapOutput(output, input);
  if (input.mode === "refresh" && options.last_run) {
    const prev = unwrapLegacy(options.last_run);
    const prevLeads = Array.isArray(prev.hot_leads) ? prev.hot_leads : [];
    const prevKeys = new Set(
      prevLeads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
    );
    const currentKeys = new Set(
      hot_leads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
    );
    const diff = {
      added: [...currentKeys].filter((key) => !prevKeys.has(key)),
      removed: [...prevKeys].filter((key) => !currentKeys.has(key))
    };
    if (envelope.meta && envelope.meta.handoff && envelope.meta.handoff.entities) {
      envelope.meta.handoff.entities.diff = diff;
    }
  }
  return { output: envelope, effectiveInput: input };
};

const generateArtemOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateArtemOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.hot_leads)) errors.push("hot_leads must be array");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.hot_leads)) {
    payload.hot_leads.forEach((lead, index) => {
      if (!["need_vendor", "need_advice", "complaint_trigger", "price_check", "other"].includes(lead.intent_class)) {
        errors.push(`hot_leads[${index}].intent_class invalid`);
      }
      if (!Array.isArray(lead.reply_angle_options) || lead.reply_angle_options.length !== 3) {
        errors.push(`hot_leads[${index}].reply_angle_options must be 3 items`);
      }
      if (!lead.qualification_question || typeof lead.qualification_question !== "string") {
        errors.push(`hot_leads[${index}].qualification_question required`);
      }
      if (!lead.risk_flags || typeof lead.risk_flags.privacy_risk !== "boolean") {
        errors.push(`hot_leads[${index}].risk_flags.privacy_risk required`);
      }
      if (!lead.recency_hint || typeof lead.recency_hint !== "string") {
        errors.push(`hot_leads[${index}].recency_hint required`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  artemAgent,
  normalizeInput,
  generateOutput,
  generateArtemOutput,
  validateArtemOutput
};
