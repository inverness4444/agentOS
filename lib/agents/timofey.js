const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const { extractFromHtml } = require("../../extractors");

const DEFAULT_AGENTOS_CONTEXT = {
  name: "AgentOS",
  one_liner:
    "Маркетплейс и оркестрация ИИ-агентов для бизнеса: лидоген, поддержка, контент, аналитика, автоматизация процессов",
  pricing_monthly_rub: 5000,
  no_trial: true
};

const inputDefaults = {
  mode: "deep",
  has_web_access: true,
  max_web_requests: null,
  geo: "Россия",
  focus_segments: ["sellers", "local", "b2b"],
  niche_hint: "",
  competitor_types: [
    "ai_agency",
    "chatbots",
    "wb_ozon_marketing",
    "call_center",
    "crm_impl"
  ],
  include_pricing: true,
  include_cases: true,
  require_proof: true,
  recency_days: 365,
  allow_placeholders_if_blocked: true,
  exclude_domains: [],
  agentos_context: { ...DEFAULT_AGENTOS_CONTEXT }
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep", "continue", "refresh"], default: "deep" },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    geo: { type: "string", default: "Россия" },
    focus_segments: {
      type: "array",
      items: { type: "string", enum: ["sellers", "local", "b2b"] },
      default: ["sellers", "local", "b2b"]
    },
    niche_hint: { type: "string" },
    competitor_types: {
      type: "array",
      items: {
        type: "string",
        enum: ["ai_agency", "chatbots", "wb_ozon_marketing", "call_center", "crm_impl"]
      },
      default: [
        "ai_agency",
        "chatbots",
        "wb_ozon_marketing",
        "call_center",
        "crm_impl"
      ]
    },
    include_pricing: { type: "boolean", default: true },
    include_cases: { type: "boolean", default: true },
    require_proof: { type: "boolean", default: true },
    recency_days: { type: "number", default: 365 },
    allow_placeholders_if_blocked: { type: "boolean", default: true },
    exclude_domains: { type: "array", items: { type: "string" }, default: [] },
    agentos_context: { type: "object" }
  },
  required: ["mode", "has_web_access"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: [
    "competitors",
    "pricing_evidence",
    "comparison_table",
    "win_angles",
    "agentos_positioning",
    "offers",
    "meta"
  ],
  additionalProperties: false,
  properties: {
    competitors: { type: "array" },
    pricing_evidence: { type: "object" },
    comparison_table: { type: "array" },
    win_angles: { type: "array" },
    agentos_positioning: { type: "object" },
    offers: { type: "object" },
    meta: { type: "object" }
  }
};

const COMPARISON_COLUMNS = [
  "УТП",
  "сегменты",
  "оффер",
  "цены",
  "кейсы",
  "гарантии",
  "скорость",
  "договор/акты",
  "каналы",
  "слабые места"
];

const TYPE_TO_SEGMENTS = {
  ai_agency: "sellers/local/b2b",
  chatbots: "local/b2b",
  wb_ozon_marketing: "sellers",
  call_center: "local/b2b",
  crm_impl: "b2b"
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Тимофей — Анализ конкурентов".
Роль: искать конкурентов/альтернативы в РФ и формировать сравнение, углы выигрыша и позиционирование AgentOS.
Никаких выдумок: все утверждения только с proof_items.`;

const timofeyAgent = {
  id: "timofey-competitor-analysis-ru",
  displayName: "Тимофей — Анализ конкурентов",
  description:
    "Ищет конкурентов/альтернативы в РФ, делает сравнение и формулирует позиционирование AgentOS.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: timofeyAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const sanitizeEvidenceSnippet = (text, max = 160) => sanitizeSnippet(text, max);

const resolveMaxRequests = (mode, maxRequests) => {
  if (typeof maxRequests === "number" && Number.isFinite(maxRequests) && maxRequests > 0) {
    return Math.round(maxRequests);
  }
  return mode === "quick" ? 30 : 80;
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode =
    safe.mode === "quick" || safe.mode === "continue" || safe.mode === "refresh"
      ? safe.mode
      : "deep";
  const focus_segments = Array.isArray(safe.focus_segments)
    ? safe.focus_segments.filter((item) => ["sellers", "local", "b2b"].includes(item))
    : ["sellers", "local", "b2b"];
  const competitor_types = Array.isArray(safe.competitor_types)
    ? safe.competitor_types.filter((item) =>
        ["ai_agency", "chatbots", "wb_ozon_marketing", "call_center", "crm_impl"].includes(item)
      )
    : ["ai_agency", "chatbots", "wb_ozon_marketing", "call_center", "crm_impl"];
  const agentos_context =
    safe.agentos_context && typeof safe.agentos_context === "object"
      ? { ...DEFAULT_AGENTOS_CONTEXT, ...safe.agentos_context }
      : { ...DEFAULT_AGENTOS_CONTEXT };

  const normalized = {
    mode,
    has_web_access: typeof safe.has_web_access === "boolean" ? safe.has_web_access : true,
    max_web_requests: resolveMaxRequests(mode, safe.max_web_requests),
    geo: typeof safe.geo === "string" && safe.geo.trim() ? safe.geo.trim() : "Россия",
    focus_segments,
    niche_hint: typeof safe.niche_hint === "string" ? safe.niche_hint.trim() : "",
    competitor_types,
    include_pricing: typeof safe.include_pricing === "boolean" ? safe.include_pricing : true,
    include_cases: typeof safe.include_cases === "boolean" ? safe.include_cases : true,
    require_proof: typeof safe.require_proof === "boolean" ? safe.require_proof : true,
    recency_days:
      typeof safe.recency_days === "number" && Number.isFinite(safe.recency_days)
        ? Math.max(1, Math.round(safe.recency_days))
        : 365,
    allow_placeholders_if_blocked:
      typeof safe.allow_placeholders_if_blocked === "boolean"
        ? safe.allow_placeholders_if_blocked
        : true,
    exclude_domains: Array.isArray(safe.exclude_domains)
      ? safe.exclude_domains.filter((item) => typeof item === "string" && item.trim())
      : [],
    agentos_context
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxWebRequestsPath: ["max_web_requests"]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const SEARCH_QUERIES = {
  ai_agency: ["AI агентство автоматизация бизнеса", "AI ассистенты для бизнеса"],
  chatbots: ["чат-боты для продаж", "чат-бот поддержка VK Telegram"],
  wb_ozon_marketing: ["маркетинг WB Ozon агентство", "продвижение на Wildberries"],
  call_center: ["колл-центр лидоген", "обработка заявок колл-центр"],
  crm_impl: ["внедрение amoCRM", "внедрение Bitrix24", "CRM интегратор"]
};

const SEGMENT_QUERIES = {
  sellers: ["для селлеров", "маркетплейс"],
  local: ["для локального бизнеса", "услуги"],
  b2b: ["B2B", "для бизнеса"]
};

const buildSearchPlan = (input) => {
  const queries = [];
  input.competitor_types.forEach((type) => {
    const base = SEARCH_QUERIES[type] || [];
    base.forEach((query) => {
      queries.push(query);
      if (input.niche_hint) queries.push(`${query} ${input.niche_hint}`);
    });
  });
  input.focus_segments.forEach((segment) => {
    (SEGMENT_QUERIES[segment] || []).forEach((hint) => {
      queries.push(`AI автоматизация ${hint}`);
      if (input.niche_hint) queries.push(`${input.niche_hint} ${hint}`);
    });
  });
  const deduped = [...new Set(queries.map((item) => item.trim()).filter(Boolean))];
  return deduped;
};

const sourceTypeForUrl = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("vk.com") || host.includes("t.me")) return "social";
    return "website";
  } catch {
    return "other";
  }
};

const extractCompetitorName = (url, title = "") => {
  if (title) {
    return title.split("|")[0].split("—")[0].trim();
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const extractSignalsFromPage = (page, competitorName, pageType, proofItems) => {
  const text = page.text || "";
  const lower = text.toLowerCase();
  const proofs = [];

  const pushProof = (signalType, signalValue, snippet) => {
    const proof = {
      url: page.url,
      competitor_name: competitorName,
      source_type: sourceTypeForUrl(page.url),
      page_type: pageType,
      signal_type: signalType,
      signal_value: signalValue,
      evidence_snippet: sanitizeEvidenceSnippet(snippet || `${signalType}: ${signalValue}`)
    };
    const index = proofItems.length + proofs.length;
    proofs.push({ ...proof, _index: index });
  };

  if (pageType === "pricing") {
    const priceMatch = text.match(/(от\s*)?(\d{2,6})\s*(₽|руб|руб\.)/i);
    if (priceMatch) {
      const value = Number(priceMatch[2]);
      pushProof("pricing_from", value, `price_from=${value}`);
    } else if (/по запросу|индивидуально/i.test(text)) {
      pushProof("pricing_request", "по запросу", "pricing: по запросу");
    }
  }

  if (pageType === "cases" && /кейс|case|проект/i.test(text)) {
    pushProof("case_presence", "cases", "cases: mentioned");
    const metric = text.match(/(ROI|рост|увеличение)\s*\+?(\d{1,3})%/i);
    if (metric) {
      pushProof("case_metric", `${metric[1]} ${metric[2]}%`, `case_metric=${metric[1]} ${metric[2]}%`);
    }
  }

  if (/гарант|SLA|договор/i.test(text)) {
    pushProof("guarantee_or_contract", "mentioned", "guarantee/contract mentioned");
  }

  if (/запуск\s*за\s*\d+|быстрый\s*запуск/i.test(text)) {
    const match = text.match(/запуск\s*за\s*(\d+\s*дн)/i);
    pushProof("launch_speed", match ? match[0] : "быстрый запуск", match ? match[0] : "fast launch");
  }

  const promiseMatch = text.match(/(увеличим|рост|повысим|привлечем|увеличение)\s+[\w\s]+/i);
  if (promiseMatch) {
    pushProof("promise", promiseMatch[0], promiseMatch[0]);
  }

  if (/не гарантируем|без гарантий/i.test(lower)) {
    pushProof("not_promised", "без гарантий", "не гарантируем");
  }

  const seoHint = /seo|поисков/i.test(lower);
  if (seoHint) {
    pushProof("channel_seo", "seo", "channel: seo");
  }

  const directHint = /директ|yandex\s*direct/i.test(lower);
  if (directHint) {
    pushProof("channel_yandex_direct", "yandex_direct", "channel: yandex direct");
  }

  return proofs;
};

const buildCompetitorFromSignals = (name, primaryUrl, type, geo, signals, proofRefs) => {
  const pricingProof = signals.find((item) => item.signal_type.startsWith("pricing"));
  const pricing_model = {
    model: pricingProof ? "from" : "unknown",
    price_from_rub: pricingProof && typeof pricingProof.signal_value === "number" ? pricingProof.signal_value : null,
    price_note: pricingProof && typeof pricingProof.signal_value === "string" ? pricingProof.signal_value : null,
    unknown: !pricingProof
  };

  const casesProof = signals.find((item) => item.signal_type === "case_presence");
  const cases = {
    has_cases: Boolean(casesProof),
    examples_short: casesProof ? ["кейсы упомянуты"] : [],
    unknown: !casesProof
  };

  const promises = signals
    .filter((item) => item.signal_type === "promise")
    .map((item) => String(item.signal_value));
  const not_promised = signals
    .filter((item) => item.signal_type === "not_promised")
    .map((item) => String(item.signal_value));

  const launchProof = signals.find((item) => item.signal_type === "launch_speed");
  const guaranteesProof = signals.find((item) => item.signal_type === "guarantee_or_contract");

  const channels = {
    seo: signals.some((item) => item.signal_type === "channel_seo"),
    yandex_direct_hint: signals.some((item) => item.signal_type === "channel_yandex_direct"),
    vk: primaryUrl.includes("vk.com"),
    telegram: primaryUrl.includes("t.me"),
    cold_outreach_hint: signals.some((item) => item.signal_type === "cold_outreach"),
    unknown: !signals.some((item) => item.signal_type.startsWith("channel_"))
  };

  return {
    name,
    primary_url: primaryUrl,
    type,
    geo,
    pricing_model,
    cases,
    promises,
    not_promised,
    launch_speed: {
      text: launchProof ? String(launchProof.signal_value) : null,
      unknown: !launchProof
    },
    guarantees_contract: {
      text: guaranteesProof ? String(guaranteesProof.signal_value) : null,
      unknown: !guaranteesProof
    },
    channels,
    proof_refs: proofRefs
  };
};

const uniqueRefs = (refs) =>
  [...new Set((Array.isArray(refs) ? refs : []).filter((item) => Number.isInteger(item)))];

const pickRefsByPrefix = (signalRefMap, prefixes) => {
  const map = signalRefMap && typeof signalRefMap === "object" ? signalRefMap : {};
  const refSet = new Set();
  Object.entries(map).forEach(([key, refs]) => {
    if (prefixes.some((prefix) => key === prefix || key.startsWith(prefix))) {
      uniqueRefs(refs).forEach((ref) => refSet.add(ref));
    }
  });
  return [...refSet].sort((a, b) => a - b);
};

const buildColumnCell = (value, proofRefs) => {
  const refs = uniqueRefs(proofRefs).slice(0, 5);
  if (!refs.length) {
    return { value: "unknown", proof_refs: [] };
  }
  return { value: value || "unknown", proof_refs: refs };
};

const channelsToText = (channels) => {
  if (!channels || typeof channels !== "object") return "";
  const list = [];
  if (channels.seo) list.push("SEO");
  if (channels.yandex_direct_hint) list.push("Yandex Direct");
  if (channels.vk) list.push("VK");
  if (channels.telegram) list.push("Telegram");
  if (channels.cold_outreach_hint) list.push("Cold outreach");
  return list.join(", ");
};

const detectWeakPoints = (competitor) => {
  const weaknesses = [];
  if (competitor?.pricing_model?.unknown) weaknesses.push("цены не раскрыты");
  if (competitor?.cases?.unknown) weaknesses.push("кейсы не раскрыты");
  if (competitor?.launch_speed?.unknown) weaknesses.push("скорость не раскрыта");
  if (competitor?.guarantees_contract?.unknown) weaknesses.push("условия договора не раскрыты");
  return weaknesses.join("; ");
};

const buildComparisonRow = (competitor) => {
  const signalRefMap = competitor?._signal_ref_map || {};
  const fallbackRefs = uniqueRefs(competitor?.proof_refs || []);

  const pricingRefs = pickRefsByPrefix(signalRefMap, ["pricing_"]);
  const caseRefs = pickRefsByPrefix(signalRefMap, ["case_"]);
  const guaranteeRefs = pickRefsByPrefix(signalRefMap, ["guarantee_or_contract"]);
  const speedRefs = pickRefsByPrefix(signalRefMap, ["launch_speed"]);
  const channelRefs = pickRefsByPrefix(signalRefMap, ["channel_"]);
  const promiseRefs = pickRefsByPrefix(signalRefMap, ["promise"]);
  const contractRefs = pickRefsByPrefix(signalRefMap, ["guarantee_or_contract"]);

  const pricingValue = competitor?.pricing_model?.unknown
    ? "цены не указаны"
    : competitor?.pricing_model?.price_from_rub
      ? `от ${competitor.pricing_model.price_from_rub} ₽`
      : competitor?.pricing_model?.price_note || "по запросу";
  const casesValue = competitor?.cases?.unknown
    ? "кейсы не указаны"
    : competitor?.cases?.examples_short?.join("; ") || "кейсы упомянуты";

  const values = {
    "УТП": buildColumnCell(
      competitor?.promises?.[0] || competitor?.not_promised?.[0] || "",
      promiseRefs.length ? promiseRefs : fallbackRefs
    ),
    сегменты: buildColumnCell(TYPE_TO_SEGMENTS[competitor?.type] || "", fallbackRefs),
    оффер: buildColumnCell(
      competitor?.promises?.slice(0, 2).join("; ") || competitor?.not_promised?.[0] || "",
      promiseRefs.length ? promiseRefs : fallbackRefs
    ),
    цены: buildColumnCell(pricingValue, pricingRefs),
    кейсы: buildColumnCell(casesValue, caseRefs),
    гарантии: buildColumnCell(
      competitor?.guarantees_contract?.text || "гарантии не указаны",
      guaranteeRefs
    ),
    скорость: buildColumnCell(
      competitor?.launch_speed?.text || "скорость не указана",
      speedRefs
    ),
    "договор/акты": buildColumnCell(
      competitor?.guarantees_contract?.text || "договор/акты не указаны",
      contractRefs
    ),
    каналы: buildColumnCell(channelsToText(competitor?.channels), channelRefs),
    "слабые места": buildColumnCell(detectWeakPoints(competitor), fallbackRefs)
  };

  return {
    competitor_name: competitor?.name || "",
    column_order: COMPARISON_COLUMNS,
    columns: values
  };
};

const buildPricingEvidence = (competitors) => {
  const items = Array.isArray(competitors) ? competitors : [];
  const perCompetitor = items.map((competitor) => {
    const signalRefMap = competitor?._signal_ref_map || {};
    const pricingRefs = pickRefsByPrefix(signalRefMap, ["pricing_"]);
    const checked = Array.isArray(competitor?._pricing_checked_urls)
      ? competitor._pricing_checked_urls
      : [];
    return {
      competitor_name: competitor?.name || "",
      status: pricingRefs.length ? "pricing_found" : "pricing_unknown",
      what_checked: checked.length ? checked : ["home", "/pricing", "/prices"],
      proof_refs: pricingRefs
    };
  });

  const checkedAll = [...new Set(perCompetitor.flatMap((item) => item.what_checked || []))];
  const anyPricing = perCompetitor.some((item) => item.status === "pricing_found");

  return {
    status: anyPricing ? "pricing_found" : "pricing_unknown",
    pricing_unknown: !anyPricing,
    what_checked: checkedAll,
    competitors: perCompetitor
  };
};

const computeProofCoverageRatio = (comparisonTable, winAngles) => {
  const rows = Array.isArray(comparisonTable) ? comparisonTable : [];
  const angles = Array.isArray(winAngles) ? winAngles : [];
  let total = 0;
  let covered = 0;

  rows.forEach((row) => {
    const columns = row && row.columns && typeof row.columns === "object" ? row.columns : {};
    COMPARISON_COLUMNS.forEach((column) => {
      total += 1;
      const refs = uniqueRefs(columns[column]?.proof_refs);
      if (refs.length > 0) covered += 1;
    });
  });

  angles.forEach((angle) => {
    total += 1;
    if (uniqueRefs(angle?.proof_refs).length > 0) covered += 1;
  });

  if (total === 0) return 0;
  return Number((covered / total).toFixed(3));
};

const evaluateProofCoverage = (ratio) => {
  const numeric = Number.isFinite(Number(ratio)) ? Number(ratio) : 0;
  if (numeric < 0.4) {
    return {
      needsReview: true,
      warnings: [],
      limitations: ["low_proof_coverage"]
    };
  }
  if (numeric < 0.6) {
    return {
      needsReview: false,
      warnings: ["low_proof_coverage"],
      limitations: []
    };
  }
  return {
    needsReview: false,
    warnings: [],
    limitations: []
  };
};

const summarizeTrace = (trace) => {
  return trace.reduce((acc, item) => {
    const key = `${item.domain}:${item.type}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const webClient = options.webClient;

  const lastData = unwrapLegacy(options.last_run);
  const previousQueries =
    input.mode === "continue" &&
    lastData &&
    lastData.meta &&
    lastData.meta.search_plan &&
    Array.isArray(lastData.meta.search_plan.queries_used)
      ? lastData.meta.search_plan.queries_used
      : null;
  const queries = previousQueries && previousQueries.length ? previousQueries : buildSearchPlan(input);
  const search_plan = { queries_used: queries };

  if (!input.has_web_access || !webClient) {
    const emptyOffers = {
      sellers_offer: {
        offer_name: "AgentOS для селлеров",
        target_segment: "sellers",
        promise: "Пилот с прозрачной ценой и коротким запуском.",
        what_you_get: [],
        time_to_value_estimate: "3–7 дней",
        onboarding_steps: [],
        pricing: "unknown",
        objections_and_answers: [],
        risk_reversal: "Стартуем с пилота без долгого контракта.",
        first_step: "Мини-аудит и план пилота.",
        cta: "Согласовать пилот"
      },
      local_offer: {
        offer_name: "AgentOS для локального бизнеса",
        target_segment: "local",
        promise: "Пилот на одном канале без KPI-обещаний.",
        what_you_get: [],
        time_to_value_estimate: "3–7 дней",
        onboarding_steps: [],
        pricing: "unknown",
        objections_and_answers: [],
        risk_reversal: "Ограничиваемся пилотом и фиксируем выводы.",
        first_step: "Мини-аудит потока обращений.",
        cta: "Согласовать пилот"
      },
      b2b_offer: {
        offer_name: "AgentOS для B2B",
        target_segment: "b2b",
        promise: "Пилот на одном этапе пресейла без долгого обязательства.",
        what_you_get: [],
        time_to_value_estimate: "3–7 дней",
        onboarding_steps: [],
        pricing: "unknown",
        objections_and_answers: [],
        risk_reversal: "Пилот без KPI-обещаний и без длинного контракта.",
        first_step: "Мини-аудит текущего пресейла.",
        cta: "Согласовать пилот"
      }
    };

    const legacyOutput = {
      competitors: [],
      pricing_evidence: {
        status: "pricing_unknown",
        pricing_unknown: true,
        what_checked: [],
        competitors: []
      },
      comparison_table: [],
      win_angles: [
        {
          what_to_say: "Начнем с пилота и прозрачной рамки без ретейнера.",
          proof_to_show: "Публичных цен у конкурентов может не быть.",
          target_segment: "sellers",
          proof_refs: []
        },
        {
          what_to_say: "Сфокусируемся на одной боли и проверим ценность на коротком отрезке.",
          proof_to_show: "Сравнить можно после сбора публичных сигналов.",
          target_segment: "local",
          proof_refs: []
        },
        {
          what_to_say: "Для B2B безопаснее стартовать с мини-пилота и измерить процесс.",
          proof_to_show: "Нужен доступ к открытым данным по конкурентам.",
          target_segment: "b2b",
          proof_refs: []
        }
      ],
      agentos_positioning: {},
      offers: emptyOffers,
      meta: {
        generated_at: new Date().toISOString(),
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
        limitations: ["Нет веб-доступа для поиска конкурентов."],
        assumptions: [],
        search_plan,
        quality_checks: {
          no_fabrication: true,
          pricing_unknown_rate: 1,
          cases_unknown_rate: 1,
          proof_coverage_ratio: 0
        }
      }
    };
    applyBudgetMeta(legacyOutput.meta, input);
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  const excludeDomains = new Set(input.exclude_domains.map((item) => item.toLowerCase()));
  const seedLimit = input.mode === "quick" ? 30 : 60;
  const competitorSeeds = new Map();

  for (const query of queries) {
    const results = await webClient.search(query, "yandex", input.mode === "quick" ? 4 : 6);
    results.forEach((item) => {
      const url = canonicalizeUrl(item.url);
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (excludeDomains.has(host)) return;
        if (!competitorSeeds.has(host) && competitorSeeds.size < seedLimit) {
          competitorSeeds.set(host, { url, query });
        }
      } catch {
        return;
      }
    });
  }

  const proofItems = [];
  const competitors = [];
  const comparison_table = [];
  const limitations = [];

  for (const [host, seed] of competitorSeeds.entries()) {
    const primaryUrl = seed.url;
    const type = input.competitor_types.find((t) => seed.query.includes("WB") ? t : t) || "ai_agency";
    const geo = input.geo;

    const pagesToFetch = [
      { url: primaryUrl, type: "home" },
      { url: `${primaryUrl.replace(/\/$/, "")}/pricing`, type: "pricing" },
      { url: `${primaryUrl.replace(/\/$/, "")}/prices`, type: "pricing" },
      { url: `${primaryUrl.replace(/\/$/, "")}/cases`, type: "cases" },
      { url: `${primaryUrl.replace(/\/$/, "")}/services`, type: "services" },
      { url: `${primaryUrl.replace(/\/$/, "")}/contacts`, type: "contacts" }
    ];
    const pagesBatch = pagesToFetch.slice(0, 4);

    const signals = [];
    const proofRefs = [];
    const signalRefMap = {};
    const pricingCheckedUrls = [];
    let blockedCount = 0;

    const addSignalRef = (signalType, index) => {
      const key = typeof signalType === "string" && signalType.trim() ? signalType : "snippet";
      if (!Array.isArray(signalRefMap[key])) {
        signalRefMap[key] = [];
      }
      signalRefMap[key].push(index);
    };

    for (const pageRef of pagesBatch) {
      if (pageRef.type === "pricing") {
        try {
          pricingCheckedUrls.push(new URL(pageRef.url).pathname || pageRef.url);
        } catch {
          pricingCheckedUrls.push(pageRef.url);
        }
      }
      const page = await webClient.fetchPage(pageRef.url, { type: pageRef.type });
      if ("blocked" in page) {
        blockedCount += 1;
        continue;
      }
      const name = extractCompetitorName(page.url, page.title);
      const genericExtract = extractFromHtml(page.html || "", page.url);
      if (genericExtract && Array.isArray(genericExtract.proof_items)) {
        genericExtract.proof_items.forEach((item) => {
          const index = proofItems.length;
          proofItems.push({
            url: item.url || page.url,
            competitor_name: name,
            source_type: pageRef.type,
            page_type: pageRef.type,
            signal_type: item.signal_type || "snippet",
            signal_value: item.signal_value || item.url || "snippet",
            evidence_snippet: sanitizeEvidenceSnippet(item.evidence_snippet || "")
          });
          proofRefs.push(index);
          addSignalRef(item.signal_type || "snippet", index);
        });
      }
      const proofs = extractSignalsFromPage(page, name, pageRef.type, proofItems);
      proofs.forEach((proof) => {
        const index = proofItems.length;
        proofItems.push({
          url: proof.url,
          competitor_name: proof.competitor_name,
          source_type: proof.source_type,
          page_type: proof.page_type,
          signal_type: proof.signal_type,
          signal_value: proof.signal_value,
          evidence_snippet: sanitizeEvidenceSnippet(proof.evidence_snippet)
        });
        proofRefs.push(index);
        addSignalRef(proof.signal_type, index);
        signals.push({ ...proof, _index: index });
      });
    }

    if (blockedCount >= pagesBatch.length && !input.allow_placeholders_if_blocked) {
      limitations.push(`Источник недоступен: ${primaryUrl}`);
      continue;
    }

    const competitorName = extractCompetitorName(primaryUrl, "");
    const competitor = buildCompetitorFromSignals(
      competitorName,
      primaryUrl,
      type,
      geo,
      signals,
      [...new Set(proofRefs)]
    );
    competitor._signal_ref_map = signalRefMap;
    competitor._pricing_checked_urls = pricingCheckedUrls;

    if (input.require_proof) {
      if (competitor.pricing_model.unknown) competitor.pricing_model.unknown = true;
      if (competitor.cases.unknown) competitor.cases.unknown = true;
    }

    competitors.push(competitor);
    comparison_table.push(buildComparisonRow(competitor));
  }

  const pricingUnknownRate =
    competitors.length === 0
      ? 1
      : competitors.filter((item) => item.pricing_model.unknown).length / competitors.length;
  const casesUnknownRate =
    competitors.length === 0
      ? 1
      : competitors.filter((item) => item.cases.unknown).length / competitors.length;

  const pricing_evidence = buildPricingEvidence(competitors);

  const firstRow = comparison_table[0] || { columns: {} };
  const pricingGapRefs = uniqueRefs(firstRow.columns?.["цены"]?.proof_refs || []);
  const speedRefs = uniqueRefs(firstRow.columns?.["скорость"]?.proof_refs || []);
  const weakRefs = uniqueRefs(firstRow.columns?.["слабые места"]?.proof_refs || []);
  const fallbackRefs = proofItems.length ? [0] : [];

  const win_angles = [
    {
      what_to_say:
        "Начнем с мини-аудита и прозрачного пилота без ретейнера, чтобы вы увидели ценность за 3–7 дней.",
      proof_to_show: "Покажите, где у конкурентов цены не раскрыты или только «по запросу».",
      target_segment: "sellers",
      proof_refs: pricingGapRefs.length ? pricingGapRefs : fallbackRefs
    },
    {
      what_to_say:
        "Закроем рутину заявок и ответов как продукт, а не как ручную услугу команды подрядчика.",
      proof_to_show: "Покажите разрыв: обещания есть, но SLA/гарантии и договорные рамки описаны слабо.",
      target_segment: "local",
      proof_refs: weakRefs.length ? weakRefs : fallbackRefs
    },
    {
      what_to_say:
        "Для B2B выгоднее стартовать с пилота на одном процессе и масштабировать после проверки сигнала.",
      proof_to_show: "Покажите, что скорость запуска и кейсы у части рынка не подтверждены публично.",
      target_segment: "b2b",
      proof_refs: speedRefs.length ? speedRefs : fallbackRefs
    }
  ];

  const agentos_positioning = {
    differentiators: [
      "Продуктовый подход вместо агентских часов",
      "Быстрый запуск за 3–7 дней",
      "Единый стек агентов под лидоген/поддержку/контент"
    ],
    anti_bullshit_lines: [
      "Мы не обещаем KPI без данных",
      "Не агентство и не фриланс — продукт с прозрачной ценой",
      "Сначала пилот, затем масштабирование"
    ],
    ready_phrases: [
      "AgentOS — оркестратор агентов под ключевые процессы бизнеса.",
      "Запуск первого агента за 3–7 дней.",
      "Прозрачная цена 5000 ₽/мес без скрытых ставок.",
      "Фокус на скорости ответа и качестве контента.",
      "Не обещаем KPI без данных — сначала диагностика.",
      "Можно подключить WB/Ozon, сайт и мессенджеры в один поток.",
      "Автоматизируем рутину: лиды, поддержка, отчеты.",
      "Пилот → измерение → масштабирование.",
      "Работаем в РФ, с учетом локальных каналов.",
      "Агенты можно настраивать под отраслевые сценарии."
    ],
    battlecard: [
      { question: "У нас уже агентство", answer: "AgentOS закрывает рутину дешевле и быстрее, агентство не нужно на постоянке." },
      { question: "Нам нужен колл‑центр", answer: "Часть обращений можно закрыть агентами, люди остаются для сложных кейсов." },
      { question: "Мы боимся обещаний", answer: "Мы не обещаем KPI без данных — сначала пилот и метрики." },
      { question: "Сложно внедрять", answer: "Стартуем с одного процесса, 3–7 дней на запуск." },
      { question: "Нужны кейсы", answer: "Показываем быстрый пилот на ваших данных." },
      { question: "Дорого", answer: "Базовый план 5000 ₽/мес, дальше масштабирование." }
    ]
  };

  const offers = {
    sellers_offer: {
      offer_name: "AgentOS для селлеров",
      target_segment: "sellers",
      promise: "Ускоряем ответы и обновление карточек без обещаний KPI",
      what_you_get: [
        "Автоответы на отзывы",
        "Контент для карточек",
        "Мониторинг вопросов"
      ],
      time_to_value_estimate: "3–7 дней",
      onboarding_steps: ["Бриф", "Доступ к кабинету", "Пилот"],
      pricing: "5000 ₽/мес базовый план",
      objections_and_answers: [
        "У нас есть менеджер → агент ускорит рутину",
        "Дорого → базовый план 5000 ₽/мес",
        "Сложно → начнем с 1 категории"
      ],
      risk_reversal: "Если пилот не заходит, фиксируем выводы и останавливаем без долгого контракта.",
      first_step: "Мини-аудит карточек и отзывов + пилот на 1 категории (3–7 дней).",
      cta: "Запустить пилот на 1 категории"
    },
    local_offer: {
      offer_name: "AgentOS для локального бизнеса",
      target_segment: "local",
      promise: "Автоматизируем заявки и отзывы без обещаний KPI",
      what_you_get: [
        "Ответы на отзывы",
        "Квалификация лидов",
        "Напоминания"
      ],
      time_to_value_estimate: "3–5 дней",
      onboarding_steps: ["Бриф", "Подключение каналов", "Пилот"],
      pricing: "5000 ₽/мес базовый план",
      objections_and_answers: [
        "Есть администратор → снимем рутину",
        "Нет времени → запуск за неделю",
        "Сомневаемся → пилот"
      ],
      risk_reversal: "Стартуем с одного канала и прекращаем после пилота, если формат не подходит.",
      first_step: "Мини-аудит воронки записи/обращений и тест на одном канале (3–5 дней).",
      cta: "Запустить пилот на 1 канале"
    },
    b2b_offer: {
      offer_name: "AgentOS для B2B",
      target_segment: "b2b",
      promise: "Ускоряем пресейл и обработку лидов без обещаний KPI",
      what_you_get: [
        "Квалификация лидов",
        "Черновики КП",
        "Follow‑ups"
      ],
      time_to_value_estimate: "5–7 дней",
      onboarding_steps: ["Бриф", "Интеграция CRM", "Пилот"],
      pricing: "5000 ₽/мес базовый план",
      objections_and_answers: [
        "Длинный цикл → ускорим пресейл",
        "Нужна точность → пилот",
        "Сложно → начнем с 1 процесса"
      ],
      risk_reversal: "Пилот на одном пресейл-процессе без обещаний KPI и без долгих обязательств.",
      first_step: "Мини-аудит пресейла + пилот на 1 этапе (квалификация или follow-up).",
      cta: "Запустить пилот на 1 сегменте лидов"
    }
  };

  const proof_coverage_ratio = computeProofCoverageRatio(comparison_table, win_angles);
  const proofCoverageStatus = evaluateProofCoverage(proof_coverage_ratio);
  const warnings = [...proofCoverageStatus.warnings];
  const needsReview = proofCoverageStatus.needsReview;
  proofCoverageStatus.limitations.forEach((item) => limitations.push(item));

  const stats = webClient.getStats();
  const trace = webClient.getTrace();
  const publicCompetitors = competitors.map((item) => {
    const next = { ...item };
    delete next._signal_ref_map;
    delete next._pricing_checked_urls;
    return next;
  });

  const output = {
    competitors: publicCompetitors,
    pricing_evidence,
    comparison_table,
    win_angles,
    agentos_positioning,
    offers,
    meta: {
      generated_at: new Date().toISOString(),
      web_stats: {
        requests_made: stats.requests_made,
        blocked_count: stats.blocked_count,
        errors_count: stats.errors_count,
        duration_ms: stats.duration_ms,
        sources_used: {
          yandex: trace.filter((item) => item.domain.includes("yandex")).length,
          wb: trace.filter((item) => item.domain.includes("wildberries")).length,
          ozon: trace.filter((item) => item.domain.includes("ozon")).length,
          vk: trace.filter((item) => item.domain.includes("vk.com")).length,
          tg: trace.filter((item) => item.domain.includes("t.me")).length,
          websites: trace.filter(
            (item) =>
              !item.domain.includes("yandex") &&
              !item.domain.includes("wildberries") &&
              !item.domain.includes("ozon") &&
              !item.domain.includes("vk.com") &&
              !item.domain.includes("t.me")
          ).length
        },
        top_errors: stats.top_errors || [],
        warnings: stats.warnings || [],
        trace_summary: summarizeTrace(trace)
      },
      proof_items: proofItems,
      needsReview,
      warnings,
      limitations,
      assumptions: [],
      search_plan,
      quality_checks: {
        no_fabrication: proofItems.length > 0,
        pricing_unknown_rate: pricingUnknownRate,
        cases_unknown_rate: casesUnknownRate,
        proof_coverage_ratio
      }
    }
  };
  applyBudgetMeta(output.meta, input);

  const envelope = wrapOutput(output, input);
  if (input.mode === "refresh" && options.last_run) {
    const prev = unwrapLegacy(options.last_run);
    const prevCompetitors = Array.isArray(prev.competitors) ? prev.competitors : [];
    const currentCompetitors = Array.isArray(output.competitors) ? output.competitors : [];
    const key = (item) => `${item.primary_url || item.name || ""}`.toLowerCase();
    const prevKeys = new Set(prevCompetitors.map(key));
    const currentKeys = new Set(currentCompetitors.map(key));
    const diff = {
      added: [...currentKeys].filter((k) => !prevKeys.has(k)),
      removed: [...prevKeys].filter((k) => !currentKeys.has(k))
    };
    if (envelope.meta && envelope.meta.handoff && envelope.meta.handoff.entities) {
      envelope.meta.handoff.entities.diff = diff;
    }
  }
  return { output: envelope, effectiveInput: input };
};

const generateTimofeyOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateTimofeyOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!payload.pricing_evidence || typeof payload.pricing_evidence !== "object") {
    errors.push("pricing_evidence is required.");
  } else {
    const status = payload.pricing_evidence.status;
    if (!["pricing_found", "pricing_unknown"].includes(status)) {
      errors.push("pricing_evidence.status must be pricing_found|pricing_unknown.");
    }
    if (!Array.isArray(payload.pricing_evidence.what_checked)) {
      errors.push("pricing_evidence.what_checked must be an array.");
    }
  }

  if (!Array.isArray(payload.comparison_table)) {
    errors.push("comparison_table must be an array.");
  } else {
    payload.comparison_table.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object") {
        errors.push(`comparison_table[${rowIndex}] must be an object.`);
        return;
      }
      if (!row.columns || typeof row.columns !== "object") {
        errors.push(`comparison_table[${rowIndex}].columns is required.`);
        return;
      }
      if (
        !Array.isArray(row.column_order) ||
        row.column_order.length !== COMPARISON_COLUMNS.length ||
        row.column_order.some((item, idx) => item !== COMPARISON_COLUMNS[idx])
      ) {
        errors.push(`comparison_table[${rowIndex}].column_order must match fixed columns.`);
      }
      COMPARISON_COLUMNS.forEach((column) => {
        const cell = row.columns[column];
        if (!cell || typeof cell !== "object") {
          errors.push(`comparison_table[${rowIndex}].columns.${column} is required.`);
          return;
        }
        if (!Array.isArray(cell.proof_refs)) {
          errors.push(`comparison_table[${rowIndex}].columns.${column}.proof_refs must be array.`);
        }
        if (cell.value !== "unknown" && (!Array.isArray(cell.proof_refs) || cell.proof_refs.length === 0)) {
          errors.push(
            `comparison_table[${rowIndex}].columns.${column} must have proof_refs for non-unknown values.`
          );
        }
      });
    });
  }

  if (!Array.isArray(payload.win_angles) || payload.win_angles.length !== 3) {
    errors.push("win_angles must be exactly 3 items.");
  } else {
    payload.win_angles.forEach((angle, index) => {
      if (!angle || typeof angle !== "object") {
        errors.push(`win_angles[${index}] must be object.`);
        return;
      }
      if (!angle.what_to_say || typeof angle.what_to_say !== "string") {
        errors.push(`win_angles[${index}].what_to_say is required.`);
      }
      if (!angle.proof_to_show || typeof angle.proof_to_show !== "string") {
        errors.push(`win_angles[${index}].proof_to_show is required.`);
      }
      if (!angle.target_segment || typeof angle.target_segment !== "string") {
        errors.push(`win_angles[${index}].target_segment is required.`);
      }
      if (!Array.isArray(angle.proof_refs)) {
        errors.push(`win_angles[${index}].proof_refs must be array.`);
      }
    });
  }
  if (!payload.offers || !payload.offers.sellers_offer || !payload.offers.local_offer || !payload.offers.b2b_offer) {
    errors.push("offers must include sellers_offer/local_offer/b2b_offer.");
  } else {
    ["sellers_offer", "local_offer", "b2b_offer"].forEach((offerKey) => {
      const offer = payload.offers[offerKey];
      if (!offer || typeof offer !== "object") return;
      if (!offer.risk_reversal || typeof offer.risk_reversal !== "string") {
        errors.push(`offers.${offerKey}.risk_reversal is required.`);
      }
      if (!offer.first_step || typeof offer.first_step !== "string") {
        errors.push(`offers.${offerKey}.first_step is required.`);
      }
    });
  }
  if (payload.meta && Array.isArray(payload.meta.proof_items)) {
    payload.meta.proof_items.forEach((item, index) => {
      if (item.evidence_snippet && item.evidence_snippet.length > 160) {
        errors.push(`proof_items[${index}] evidence_snippet too long`);
      }
      if (item.evidence_snippet && /<[^>]+>/.test(item.evidence_snippet)) {
        errors.push(`proof_items[${index}] evidence_snippet contains html`);
      }
    });
  }
  if (
    !payload.meta?.quality_checks ||
    typeof payload.meta.quality_checks.proof_coverage_ratio !== "number"
  ) {
    errors.push("meta.quality_checks.proof_coverage_ratio is required.");
  } else {
    const ratio = payload.meta.quality_checks.proof_coverage_ratio;
    if (ratio < 0 || ratio > 1) {
      errors.push("meta.quality_checks.proof_coverage_ratio must be 0..1.");
    }
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  DEFAULT_AGENTOS_CONTEXT,
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  timofeyAgent,
  normalizeInput,
  computeProofCoverageRatio,
  evaluateProofCoverage,
  generateOutput,
  generateTimofeyOutput,
  validateTimofeyOutput
};
