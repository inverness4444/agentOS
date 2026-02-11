const DEFAULT_PRODUCT_CONTEXT =
  "AgentOS — маркетплейс и оркестрация ИИ-агентов для бизнеса: лидоген, поддержка, контент, аналитика, автоматизация процессов";

const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const { normalizeEmail, normalizePhone } = require("../../utils/normalize.js");
const { extractFromHtml } = require("../../extractors");

const inputDefaults = {
  mode: "deep",
  has_web_access: true,
  max_web_requests: null,
  company_name: "",
  company_domain_or_url: "",
  geo: "",
  channel_focus: "All",
  product_context: DEFAULT_PRODUCT_CONTEXT,
  require_proof: true,
  recency_days: 365,
  allow_placeholders_if_blocked: true,
  exclude_sources: [],
  language: "ru"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep", "continue", "refresh"], default: "deep" },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    company_name: { type: "string" },
    company_domain_or_url: { type: "string" },
    geo: { type: "string" },
    channel_focus: {
      type: "string",
      enum: ["WB", "Ozon", "Website", "Maps", "VK", "Telegram", "All"],
      default: "All"
    },
    product_context: { type: "string", default: DEFAULT_PRODUCT_CONTEXT },
    require_proof: { type: "boolean", default: true },
    recency_days: { type: "number", default: 365 },
    allow_placeholders_if_blocked: { type: "boolean", default: true },
    exclude_sources: { type: "array", items: { type: "string" }, default: [] },
    language: { type: "string", enum: ["ru"], default: "ru" }
  },
  required: ["mode", "has_web_access"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["account_card", "meta"],
  additionalProperties: false,
  properties: {
    account_card: {
      type: "object",
      required: [
        "company_name",
        "primary_url",
        "discovered_channels",
        "what_they_sell",
        "who_they_sell_to",
        "avg_check_estimate",
        "quick_audit_checklist",
        "top_personalization_hooks",
        "pain_hypotheses",
        "quick_wins",
        "public_contacts",
        "contactability",
        "best_channel_to_reach",
        "needsReview"
      ],
      additionalProperties: false,
      properties: {
        company_name: { type: "string" },
        primary_url: { type: "string" },
        discovered_channels: { type: "object" },
        what_they_sell: { type: "string" },
        who_they_sell_to: { type: "string" },
        avg_check_estimate: { type: ["object", "null"] },
        quick_audit_checklist: { type: "array" },
        top_personalization_hooks: { type: "array" },
        pain_hypotheses: { type: "array" },
        quick_wins: { type: "array" },
        public_contacts: { type: "object" },
        contactability: { type: "object" },
        best_channel_to_reach: { type: "string" },
        needsReview: { type: "boolean" }
      }
    },
    meta: {
      type: "object",
      required: [
        "generated_at",
        "web_stats",
        "proof_items",
        "limitations",
        "assumptions"
      ],
      additionalProperties: false,
      properties: {
        generated_at: { type: "string" },
        web_stats: { type: "object" },
        proof_items: { type: "array" },
        limitations: { type: "array" },
        assumptions: { type: "array" }
      }
    }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Мария — Разбор компании".
Роль: быстрый разбор компании/бренда по публичным источникам. Никаких выдумок.
Собирай только публичные безопасные сигналы и выдавай proof_items.
Если нет имени/ссылки: задай вопрос "пришлите ссылку на сайт или WB/Ozon витрину (или название + город)".
`; 

const anatolyAgent = {
  id: "anatoly-account-research-ru",
  displayName: "Мария — Разбор компании",
  description:
    "Быстрый разбор компании по сайтам/маркетплейсам/соцсетям с доказательствами и гипотезами боли.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: anatolyAgent.id,
    inputEcho: input,
    mode: input.mode,
    legacyOutput
  });

const MODES = new Set(["quick", "deep", "continue", "refresh"]);
const CHANNELS = new Set(["WB", "Ozon", "Website", "Maps", "VK", "Telegram", "All"]);

const resolveMaxRequests = (mode, maxRequests) => {
  if (typeof maxRequests === "number" && Number.isFinite(maxRequests) && maxRequests > 0) {
    return Math.round(maxRequests);
  }
  return mode === "quick" ? 25 : 60;
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode = MODES.has(safe.mode) ? safe.mode : "deep";
  const channel_focus = CHANNELS.has(safe.channel_focus) ? safe.channel_focus : "All";
  const exclude_sources = Array.isArray(safe.exclude_sources)
    ? safe.exclude_sources.filter((item) => typeof item === "string" && item.trim())
    : [];
  const normalized = {
    mode,
    has_web_access: typeof safe.has_web_access === "boolean" ? safe.has_web_access : true,
    max_web_requests: resolveMaxRequests(mode, safe.max_web_requests),
    company_name: typeof safe.company_name === "string" ? safe.company_name.trim() : "",
    company_domain_or_url:
      typeof safe.company_domain_or_url === "string" ? safe.company_domain_or_url.trim() : "",
    geo: typeof safe.geo === "string" ? safe.geo.trim() : "",
    channel_focus,
    product_context:
      typeof safe.product_context === "string" && safe.product_context.trim()
        ? safe.product_context.trim()
        : DEFAULT_PRODUCT_CONTEXT,
    require_proof: typeof safe.require_proof === "boolean" ? safe.require_proof : true,
    recency_days:
      typeof safe.recency_days === "number" && Number.isFinite(safe.recency_days)
        ? Math.max(1, Math.round(safe.recency_days))
        : 365,
    allow_placeholders_if_blocked:
      typeof safe.allow_placeholders_if_blocked === "boolean"
        ? safe.allow_placeholders_if_blocked
        : true,
    exclude_sources,
    language: "ru"
  };

  const budgetResult = applyBudget(normalized, budget, {
    maxWebRequestsPath: ["max_web_requests"]
  });
  normalized.budget = budget;
  normalized.budget_applied = budgetResult.budget_applied;
  normalized.budget_warnings = budgetResult.warnings;
  return normalized;
};

const sanitizeEvidenceSnippet = (text, max = 160) => sanitizeSnippet(text, max);

const canonicalize = (url) => canonicalizeUrl(url);

const sourceTypeForUrl = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("wildberries")) return "wb";
    if (host.includes("ozon")) return "ozon";
    if (host.includes("vk.com")) return "vk";
    if (host.includes("t.me") || host.includes("telegram.me")) return "telegram";
    if (host.includes("yandex") && url.includes("/maps")) return "maps_yandex";
    if (host.includes("2gis")) return "maps_2gis";
    return "website";
  } catch {
    return "other";
  }
};

const shouldUseSource = (sourceType, channelFocus) => {
  if (channelFocus === "All") return true;
  if (channelFocus === "WB") return sourceType === "wb";
  if (channelFocus === "Ozon") return sourceType === "ozon";
  if (channelFocus === "Website") return sourceType === "website";
  if (channelFocus === "Maps")
    return sourceType === "maps_yandex" || sourceType === "maps_2gis";
  if (channelFocus === "VK") return sourceType === "vk";
  if (channelFocus === "Telegram") return sourceType === "telegram";
  return true;
};

const buildSearchQueries = (input) => {
  const name = input.company_name;
  const geo = input.geo ? ` ${input.geo}` : "";
  return [
    `${name} сайт`,
    `${name} WB`,
    `${name} Ozon`,
    `${name} отзывы${geo}`,
    `${name} Яндекс карты${geo}`,
    `${name} 2GIS${geo}`,
    `${name} VK`,
    `${name} Telegram`
  ];
};

const buildFallbackQueries = (input) => {
  const name = input.company_name;
  const geo = input.geo ? ` ${input.geo}` : "";
  return [
    `site:ozon.ru ${name} бренд`,
    `site:wildberries.ru ${name} бренд`,
    `site:vk.com ${name} магазин`,
    `site:t.me ${name} магазин`,
    `site:yandex.ru/maps ${name}${geo}`,
    `site:2gis.ru ${name}${geo}`
  ];
};

const extractSignals = (page, sourceType, input) => {
  const proofs = [];
  const contacts = { email: "", phone: "", messengers: [], widgets: [] };
  const text = page.text || "";
  const html = page.html || "";
  const genericExtract = extractFromHtml(html, page.url);
  const lower = text.toLowerCase();

  const pushProof = (signalType, signalValue, snippet) => {
    proofs.push({
      url: page.url,
      source_type: sourceType,
      title: page.title || page.url,
      signal_type: signalType,
      signal_value: signalValue,
      evidence_snippet: sanitizeEvidenceSnippet(snippet || `${signalType}: ${signalValue}`)
    });
  };

  pushProof(`${sourceType}_presence`, page.url, page.title || page.url);
  if (genericExtract && Array.isArray(genericExtract.proof_items)) {
    genericExtract.proof_items.forEach((item) => {
      pushProof(item.signal_type || "snippet", item.signal_value || page.url, item.evidence_snippet);
    });
  }

  if (sourceType === "website") {
    if (/<form/i.test(html)) {
      pushProof("lead_form", "form", "lead_form: form_detected");
    }
    if (/(jivo|livechat|whatsapp|telegram|callback|widget)/i.test(html)) {
      const widget = html.match(/(jivo|livechat|whatsapp|telegram|callback|widget)/i)?.[0];
      if (widget) {
        contacts.widgets.push(widget.toLowerCase());
        pushProof("contact_widget", widget, `widget: ${widget}`);
      }
    }
    if (/(wa\\.me|whatsapp)/i.test(html)) {
      contacts.messengers.push("whatsapp");
      pushProof("messenger", "whatsapp", "messenger: whatsapp");
    }
    if (/(t\\.me|telegram)/i.test(html)) {
      contacts.messengers.push("telegram");
      pushProof("messenger", "telegram", "messenger: telegram");
    }
    if (/vk\\.com/i.test(html)) {
      contacts.messengers.push("vk");
      pushProof("messenger", "vk", "messenger: vk");
    }
    const emailMatch = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
    if (emailMatch && emailMatch[0]) {
      contacts.email = normalizeEmail(emailMatch[0]);
      if (contacts.email) {
        pushProof("public_email", contacts.email, `email: ${contacts.email}`);
      }
    }
    const phoneMatch = text.match(/(\+7|8)\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g);
    if (phoneMatch && phoneMatch[0]) {
      contacts.phone = normalizePhone(phoneMatch[0]);
      if (contacts.phone) {
        pushProof("public_phone", contacts.phone, `phone: ${contacts.phone}`);
      }
    }
    if (/(для бизнеса|для компаний|оптом)/i.test(text)) {
      pushProof("audience_b2b", "B2B", "audience: B2B");
    }
    if (/(для дома|для вас|для семьи|для покупателей)/i.test(text)) {
      pushProof("audience_b2c", "B2C", "audience: B2C");
    }
    if (page.title) {
      pushProof("offer", page.title, `offer: ${page.title}`);
    }
  }

  if (sourceType === "wb" || sourceType === "ozon") {
    const reviews = text.match(/(\d{2,6})\s*(отзыв|reviews?)/i);
    if (reviews) {
      pushProof("reviews_count", Number(reviews[1]), `reviews: ${reviews[1]}`);
    }
    const rating = text.match(/(\d\.\d)\s*(рейтинг|rating)/i);
    if (rating) {
      pushProof("rating", Number(rating[1]), `rating: ${rating[1]}`);
    }
    const products = text.match(/(\d{2,6})\s*(товар|products|sku)/i);
    if (products) {
      pushProof("products_count", Number(products[1]), `products: ${products[1]}`);
    }
  }

  if (sourceType === "maps_yandex" || sourceType === "maps_2gis") {
    const rating = text.match(/(\d\.\d)\s*(рейтинг|rating)/i);
    if (rating) {
      pushProof("rating", Number(rating[1]), `rating: ${rating[1]}`);
    }
    const reviews = text.match(/(\d{1,6})\s*(отзыв|reviews?)/i);
    if (reviews) {
      pushProof("reviews_count", Number(reviews[1]), `reviews: ${reviews[1]}`);
    }
    const complaintKeywords = ["доставк", "срок", "качество", "персонал", "поддержк", "возврат", "упаковк"];
    complaintKeywords.forEach((keyword) => {
      if (lower.includes(keyword) && /(жалоб|плох|недоволь)/i.test(lower)) {
        pushProof("complaint_theme", keyword, `complaint_theme: ${keyword}`);
      }
    });
  }

  if (sourceType === "vk" || sourceType === "telegram") {
    const followers = text.match(/(\d{1,7})\s*(подпис)/i);
    if (followers) {
      pushProof("followers_count", Number(followers[1]), `followers: ${followers[1]}`);
    }
    const posts = text.match(/(\d{1,3})\s*(пост|posts?)/i);
    if (posts) {
      pushProof("posts_recent", Number(posts[1]), `posts_recent: ${posts[1]}`);
    }
    if (page.title) {
      pushProof("social_title", page.title, `social_title: ${page.title}`);
    }
  }

  contacts.messengers = [...new Set(contacts.messengers)];
  contacts.widgets = [...new Set(contacts.widgets)];
  return { proofs, contacts };
};

const dedupeProofs = (items) => {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const key = `${item.url}|${item.signal_type}|${item.signal_value}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const buildHooks = (proofItems, maxHooks) => {
  const hooks = [];
  proofItems.forEach((proof, index) => {
    if (hooks.length >= maxHooks) return;
    let text = "";
    if (proof.signal_type === "complaint_theme") {
      text = `В отзывах есть жалобы на ${proof.signal_value}.`;
    } else if (proof.signal_type === "reviews_count") {
      text = `Найдено ${proof.signal_value} отзывов — можно ускорить ответы и аналитику.`;
    } else if (proof.signal_type === "rating" && Number(proof.signal_value) < 4.6) {
      text = `Рейтинг ${proof.signal_value} — есть потенциал поднять через автоответы/контент.`;
    } else if (proof.signal_type === "lead_form") {
      text = "На сайте есть форма заявок — можно ускорить квалификацию лидов.";
    } else if (proof.signal_type.includes("_presence")) {
      text = `Есть активный канал ${proof.source_type.toUpperCase()} — можно усилить обработку запросов.`;
    }
    if (!text) return;
    const oneLine = `${text} Источник: ${proof.url}`.replace(/\s+/g, " ").trim();
    hooks.push({
      hook_text: oneLine,
      related_proofs: [index],
      proof_refs: [index],
      source_url: proof.url
    });
  });
  return hooks.slice(0, maxHooks);
};

const buildHypotheses = (proofItems, productContext) => {
  const hypotheses = [];
  const pickProof = (type) => proofItems.findIndex((item) => item.signal_type === type);

  const complaintIndex = pickProof("complaint_theme");
  const reviewsIndex = pickProof("reviews_count");
  const leadIndex = pickProof("lead_form");
  const marketplaceIndex = proofItems.findIndex((item) =>
    ["wb_presence", "ozon_presence"].includes(item.signal_type)
  );

  const pushHypothesis = ({ symptom, cause, miniSolution, verification, refs }) => {
    const related = refs.filter((idx) => idx !== -1);
    hypotheses.push({
      statement: `${symptom} → ${cause} → ${miniSolution} (AgentOS) → ${verification}`,
      symptom,
      cause,
      mini_solution: `${miniSolution} (AgentOS)`,
      verification_needed: verification,
      related_proofs: related,
      proposed_offer: `${miniSolution} (AgentOS)`,
      expected_outcome_estimate: "Требует проверки по сигналам (estimate)",
      estimate_basis: "based_on_signals"
    });
  };

  if (complaintIndex !== -1 || reviewsIndex !== -1) {
    pushHypothesis({
      symptom: "Негатив в отзывах и медленные ответы",
      cause: "Ручная обработка и отсутствие приоритизации обращений",
      miniSolution: "Автоответы + классификация жалоб + эскалация",
      verification: "Нужны SLA ответов и динамика рейтинга за 2-4 недели",
      refs: [complaintIndex, reviewsIndex]
    });
  }

  if (leadIndex !== -1) {
    pushHypothesis({
      symptom: "Заявки поступают, но часть теряется",
      cause: "Форма и входящий поток обрабатываются вручную",
      miniSolution: "Квалификация лидов + автоответ + запись в CRM",
      verification: "Нужны данные по времени ответа и доле необработанных заявок",
      refs: [leadIndex]
    });
  }

  if (marketplaceIndex !== -1) {
    pushHypothesis({
      symptom: "Маркетплейс-процессы перегружены рутиной",
      cause: "Карточки/вопросы/ответы ведутся без автоматизации",
      miniSolution: "Оптимизация карточек + автоответы + контроль контента",
      verification: "Нужны метрики конверсии карточек и скорость ответа на вопросы",
      refs: [marketplaceIndex]
    });
  }

  while (hypotheses.length < 3) {
    const idx = proofItems[0] ? 0 : -1;
    pushHypothesis({
      symptom: "Недостаточно сигналов по узким местам",
      cause: "Данных из открытых источников мало",
      miniSolution: `Быстрый диагностический пилот (${productContext})`,
      verification: "Нужны доступы к процессам и 3-5 примеров реальных обращений",
      refs: [idx]
    });
  }

  return hypotheses.slice(0, 3);
};

const buildQuickWins = (hypotheses) => {
  return hypotheses.map((item) => item.proposed_offer).slice(0, 3);
};

const refsByType = (proofItems, typePrefix, limit = 2) =>
  proofItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.signal_type && String(item.signal_type).startsWith(typePrefix))
    .slice(0, limit)
    .map(({ index }) => index);

const refsByTypes = (proofItems, types, limit = 2) =>
  proofItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => types.includes(item.signal_type))
    .slice(0, limit)
    .map(({ index }) => index);

const buildQuickAuditChecklist = (proofItems, contacts) => {
  const hasEmail = Boolean(contacts.email);
  const hasPhone = Boolean(contacts.phone);
  const hasMessenger = Array.isArray(contacts.messengers) && contacts.messengers.length > 0;
  const hasWidget = Array.isArray(contacts.widgets) && contacts.widgets.length > 0;

  const checks = [
    {
      check: "Есть официальный сайт или витрина",
      status: refsByTypes(proofItems, ["website_presence", "wb_presence", "ozon_presence"]).length ? "PASS" : "WARN",
      proof_refs: refsByTypes(proofItems, ["website_presence", "wb_presence", "ozon_presence"])
    },
    {
      check: "Оффер читается из публичного источника",
      status: refsByType(proofItems, "offer").length ? "PASS" : "WARN",
      proof_refs: refsByType(proofItems, "offer")
    },
    {
      check: "Публичный email доступен",
      status: hasEmail ? "PASS" : "WARN",
      proof_refs: refsByType(proofItems, "public_email")
    },
    {
      check: "Публичный телефон доступен",
      status: hasPhone ? "PASS" : "WARN",
      proof_refs: refsByType(proofItems, "public_phone")
    },
    {
      check: "Есть мессенджер для быстрого контакта",
      status: hasMessenger ? "PASS" : "WARN",
      proof_refs: refsByType(proofItems, "messenger")
    },
    {
      check: "Есть виджет/форма заявки",
      status: hasWidget || refsByType(proofItems, "lead_form").length ? "PASS" : "WARN",
      proof_refs: refsByTypes(proofItems, ["contact_widget", "lead_form"])
    },
    {
      check: "Рейтинги/отзывы показывают клиентский поток",
      status: refsByTypes(proofItems, ["reviews_count", "rating"]).length ? "PASS" : "WARN",
      proof_refs: refsByTypes(proofItems, ["reviews_count", "rating"])
    },
    {
      check: "Выявлены признаки боли клиента",
      status: refsByType(proofItems, "complaint_theme").length ? "WARN" : "PASS",
      proof_refs: refsByType(proofItems, "complaint_theme")
    },
    {
      check: "Есть соцканалы для мягкого касания",
      status: refsByTypes(proofItems, ["vk_presence", "telegram_presence", "followers_count"]).length ? "PASS" : "WARN",
      proof_refs: refsByTypes(proofItems, ["vk_presence", "telegram_presence", "followers_count"])
    },
    {
      check: "Сигналов достаточно для персонализации",
      status: proofItems.length >= 3 ? "PASS" : proofItems.length >= 1 ? "WARN" : "FAIL",
      proof_refs: proofItems.slice(0, 2).map((_, index) => index)
    }
  ];

  return checks.slice(0, 12);
};

const buildBaselineChecklist = () => [
  { check: "Есть официальный сайт или витрина", status: "WARN", proof_refs: [] },
  { check: "Оффер читается из публичного источника", status: "WARN", proof_refs: [] },
  { check: "Публичный email доступен", status: "FAIL", proof_refs: [] },
  { check: "Публичный телефон доступен", status: "FAIL", proof_refs: [] },
  { check: "Есть мессенджер для быстрого контакта", status: "FAIL", proof_refs: [] },
  { check: "Есть виджет/форма заявки", status: "FAIL", proof_refs: [] },
  { check: "Рейтинги/отзывы показывают клиентский поток", status: "WARN", proof_refs: [] },
  { check: "Сигналов достаточно для персонализации", status: "FAIL", proof_refs: [] }
];

const buildContactability = (contacts, discovered) => {
  const messengers = Array.isArray(contacts.messengers) ? contacts.messengers : [];
  const widgets = Array.isArray(contacts.widgets) ? contacts.widgets : [];
  const hasEmail = Boolean(contacts.email);
  const hasPhone = Boolean(contacts.phone);
  const hasMessenger = messengers.length > 0;
  const hasWidget = widgets.length > 0;
  const hasVk = hasMessenger && messengers.includes("vk") || Boolean(discovered.vk);
  const hasTg = hasMessenger && messengers.includes("telegram") || Boolean(discovered.telegram);
  const hasWa = hasMessenger && messengers.includes("whatsapp");

  const rawScore =
    (hasEmail ? 3 : 0) +
    (hasPhone ? 3 : 0) +
    (hasMessenger ? 2 : 0) +
    (hasWidget ? 2 : 0);
  const score = Math.max(0, Math.min(10, rawScore));

  let bestChannel = "";
  if (hasTg) bestChannel = "TG";
  else if (hasVk) bestChannel = "VK";
  else if (hasWa) bestChannel = "WA";
  else if (hasEmail) bestChannel = "email";

  return {
    has_email: hasEmail,
    has_phone: hasPhone,
    has_messenger: hasMessenger,
    has_widget: hasWidget,
    score_0_10: score,
    estimate_basis: "based_on_signals",
    best_channel_to_reach: bestChannel
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

  if (!input.company_name && !input.company_domain_or_url) {
    const legacyOutput = {
      account_card: {
        company_name: "",
        primary_url: "",
        discovered_channels: {},
        what_they_sell: "",
        who_they_sell_to: "",
        avg_check_estimate: {
          value: null,
          currency: "RUB",
          estimate: true,
          estimate_basis: "insufficient_data",
          proof_refs: []
        },
        quick_audit_checklist: buildBaselineChecklist(),
        top_personalization_hooks: [],
        pain_hypotheses: [
          {
            statement: "Недостаточно сигналов → причина не определена → мини-решение: стартовый аудит (AgentOS) → нужна ссылка/название для проверки",
            symptom: "Недостаточно сигналов",
            cause: "Нет данных по компании",
            mini_solution: "Стартовый аудит (AgentOS)",
            verification_needed: "Нужны сайт/витрина или название + город",
            related_proofs: [],
            expected_outcome_estimate: "Требуется проверка (estimate)",
            estimate_basis: "insufficient_data"
          }
        ],
        quick_wins: ["Собрать базовые сигналы компании из публичных источников."],
        public_contacts: { email: "", phone: "", messengers: [], widgets: [] },
        contactability: {
          has_email: false,
          has_phone: false,
          has_messenger: false,
          has_widget: false,
          score_0_10: 0,
          estimate_basis: "insufficient_data"
        },
        best_channel_to_reach: "",
        needsReview: true
      },
      meta: {
        generated_at: new Date().toISOString(),
        web_stats: {
          requests_made: 0,
          blocked_count: 0,
          errors_count: 0,
          duration_ms: 0,
          sources_used: {
            yandex: 0,
            wb: 0,
            ozon: 0,
            vk: 0,
            tg: 0,
            websites: 0
          },
          top_errors: [],
          warnings: [],
          trace_summary: {}
        },
        proof_items: [],
        limitations: [
          "Уточнение: пришлите ссылку на сайт или WB/Ozon витрину (или название + город)."
        ],
        assumptions: []
      }
    };
    applyBudgetMeta(legacyOutput.meta, input);
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  const webStatsBase = {
    requests_made: 0,
    blocked_count: 0,
    errors_count: 0,
    duration_ms: 0,
    sources_used: { yandex: 0, wb: 0, ozon: 0, vk: 0, tg: 0, websites: 0 },
    top_errors: [],
    warnings: [],
    trace_summary: {}
  };

  if (!input.has_web_access || !webClient) {
    const legacyOutput = {
      account_card: {
        company_name: input.company_name,
        primary_url: input.company_domain_or_url,
        discovered_channels: {},
        what_they_sell: "",
        who_they_sell_to: "",
        avg_check_estimate: {
          value: null,
          currency: "RUB",
          estimate: true,
          estimate_basis: "insufficient_data",
          proof_refs: []
        },
        quick_audit_checklist: buildBaselineChecklist(),
        top_personalization_hooks: [],
        pain_hypotheses: [
          {
            statement: "Нет веб-доступа → причина не определена → мини-решение: безопасный baseline-аудит (AgentOS) → нужен доступ к публичным источникам для проверки",
            symptom: "Нет проверяемых сигналов",
            cause: "Веб-доступ отключен",
            mini_solution: "Безопасный baseline-аудит (AgentOS)",
            verification_needed: "Нужны публичные источники или выгрузка данных компании",
            related_proofs: [],
            expected_outcome_estimate: "Требуется проверка (estimate)",
            estimate_basis: "insufficient_data"
          }
        ],
        quick_wins: ["Подключить веб-доступ и собрать 3-5 подтверждённых сигналов."],
        public_contacts: { email: "", phone: "", messengers: [], widgets: [] },
        contactability: {
          has_email: false,
          has_phone: false,
          has_messenger: false,
          has_widget: false,
          score_0_10: 0,
          estimate_basis: "insufficient_data"
        },
        best_channel_to_reach: "",
        needsReview: true
      },
      meta: {
        generated_at: new Date().toISOString(),
        web_stats: webStatsBase,
        proof_items: [],
        limitations: ["Нет веб-доступа для проверки источников."],
        assumptions: []
      }
    };
    applyBudgetMeta(legacyOutput.meta, input);
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  const proofs = [];
  const limitations = [];
  const assumptions = [];
  const discovered = {};
  const contacts = { email: "", phone: "", messengers: [], widgets: [] };
  const urlsToFetch = [];
  const lastData = unwrapLegacy(options.last_run);
  const excludeDomains = new Set(input.exclude_sources.map((item) => item.toLowerCase()));

  const pushUrl = (url) => {
    if (!url) return;
    const canonical = canonicalize(url);
    try {
      const host = new URL(canonical).hostname.toLowerCase();
      if (excludeDomains.has(host)) return;
    } catch {
      return;
    }
    if (!urlsToFetch.includes(canonical)) {
      urlsToFetch.push(canonical);
    }
  };

  if (input.company_domain_or_url) {
    pushUrl(input.company_domain_or_url);
  }

  if (input.company_name) {
    const queries = buildSearchQueries(input);
    for (const query of queries) {
      const results = await webClient.search(query, "yandex", input.mode === "quick" ? 3 : 5);
      results.forEach((item) => pushUrl(item.url));
    }
  }

  if (urlsToFetch.length === 0 && input.company_name) {
    const fallback = buildFallbackQueries(input);
    for (const query of fallback) {
      const results = await webClient.search(query, "yandex", 3);
      results.forEach((item) => pushUrl(item.url));
    }
  }

  const maxPages = input.mode === "quick" ? 6 : 12;
  const continueSeeds =
    input.mode === "continue" && lastData && lastData.meta && Array.isArray(lastData.meta.seed_urls)
      ? lastData.meta.seed_urls
      : [];
  const selectedUrls = continueSeeds.length ? continueSeeds : urlsToFetch.slice(0, maxPages);

  for (const url of selectedUrls) {
    const sourceType = sourceTypeForUrl(url);
    if (!shouldUseSource(sourceType, input.channel_focus)) continue;
    const page = await webClient.fetchPage(url);
    if ("blocked" in page) {
      limitations.push(`Источник заблокирован или недоступен: ${url}`);
      continue;
    }

    const extracted = extractSignals(page, sourceType, input);
    extracted.proofs.forEach((proof) => proofs.push({ ...proof, url: canonicalize(proof.url) }));

    if (sourceType === "website" && !discovered.website) discovered.website = page.url;
    if (sourceType === "wb" && !discovered.wb) discovered.wb = page.url;
    if (sourceType === "ozon" && !discovered.ozon) discovered.ozon = page.url;
    if (sourceType === "vk" && !discovered.vk) discovered.vk = page.url;
    if (sourceType === "telegram" && !discovered.telegram) discovered.telegram = page.url;
    if (sourceType === "maps_yandex" && !discovered.maps_yandex) discovered.maps_yandex = page.url;
    if (sourceType === "maps_2gis" && !discovered.maps_2gis) discovered.maps_2gis = page.url;

    if (extracted.contacts.email && !contacts.email) contacts.email = extracted.contacts.email;
    if (extracted.contacts.phone && !contacts.phone) contacts.phone = extracted.contacts.phone;
    contacts.messengers = [...new Set([...contacts.messengers, ...extracted.contacts.messengers])];
    contacts.widgets = [...new Set([...contacts.widgets, ...extracted.contacts.widgets])];
  }

  const proofItems = dedupeProofs(proofs).map((proof) => ({
    ...proof,
    evidence_snippet: sanitizeEvidenceSnippet(proof.evidence_snippet)
  }));

  const needsReview = proofItems.length < 3 || limitations.length > 0;

  if (input.require_proof && proofItems.length < 2) {
    if (input.allow_placeholders_if_blocked) {
      proofItems.push({
        url: input.company_domain_or_url || "search",
        source_type: "other",
        title: "Insufficient data",
        signal_type: "insufficient_data",
        signal_value: "blocked_or_missing",
        evidence_snippet: "insufficient_data: limited access"
      });
    }
  }

  const hooks = buildHooks(proofItems, 5);
  while (hooks.length < 3 && proofItems[hooks.length]) {
    const idx = hooks.length;
    const proof = proofItems[idx];
    hooks.push({
      hook_text: `Сигнал: ${sanitizeEvidenceSnippet(proof.evidence_snippet, 100)} Источник: ${proof.url}`.replace(/\s+/g, " ").trim(),
      related_proofs: [idx],
      proof_refs: [idx],
      source_url: proof.url
    });
  }
  const hypotheses = buildHypotheses(proofItems, input.product_context);
  const quickWins = buildQuickWins(hypotheses);
  const quickAuditChecklist = buildQuickAuditChecklist(proofItems, contacts);
  const contactability = buildContactability(contacts, discovered);

  const offerProof = proofItems.find((item) => item.signal_type === "offer");
  const whatTheySell = offerProof ? offerProof.signal_value : "";
  const b2b = proofItems.find((item) => item.signal_type === "audience_b2b");
  const b2c = proofItems.find((item) => item.signal_type === "audience_b2c");
  const whoTheySellTo = b2b ? "B2B" : b2c ? "B2C" : "";

  const primaryUrl =
    canonicalize(input.company_domain_or_url) ||
    discovered.website ||
    discovered.wb ||
    discovered.ozon ||
    "";

  const companyName = input.company_name || (offerProof ? String(offerProof.signal_value) : "");
  const ratingProofIndex = proofItems.findIndex((item) => item.signal_type === "rating");
  const reviewsProofIndex = proofItems.findIndex((item) => item.signal_type === "reviews_count");
  const avgCheckEstimate = {
    value_range_rub: null,
    estimate: true,
    estimate_basis: proofItems.length ? "based_on_signals" : "insufficient_data",
    proof_refs: [ratingProofIndex, reviewsProofIndex].filter((idx) => idx >= 0)
  };
  if (reviewsProofIndex >= 0) {
    const reviews = Number(proofItems[reviewsProofIndex].signal_value);
    if (Number.isFinite(reviews) && reviews >= 200) {
      avgCheckEstimate.value_range_rub = "2000-8000";
    } else if (Number.isFinite(reviews) && reviews >= 50) {
      avgCheckEstimate.value_range_rub = "1000-5000";
    }
  }

  const stats = webClient.getStats();
  const trace = webClient.getTrace();

  const output = {
    account_card: {
      company_name: companyName,
      primary_url: primaryUrl,
      discovered_channels: discovered,
      what_they_sell: whatTheySell ? String(whatTheySell) : "",
      who_they_sell_to: whoTheySellTo,
      avg_check_estimate: avgCheckEstimate,
      quick_audit_checklist: quickAuditChecklist,
      top_personalization_hooks: hooks.slice(0, 5),
      pain_hypotheses: hypotheses,
      quick_wins: quickWins,
      public_contacts: {
        email: contacts.email,
        phone: contacts.phone,
        messengers: contacts.messengers,
        widgets: contacts.widgets
      },
      contactability: {
        has_email: contactability.has_email,
        has_phone: contactability.has_phone,
        has_messenger: contactability.has_messenger,
        has_widget: contactability.has_widget,
        score_0_10: contactability.score_0_10,
        estimate_basis: contactability.estimate_basis
      },
      best_channel_to_reach: contactability.best_channel_to_reach,
      needsReview
    },
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
      seed_urls: selectedUrls,
      proof_items: proofItems,
      limitations,
      assumptions
    }
  };
  applyBudgetMeta(output.meta, input);

  const envelope = wrapOutput(output, input);
  if (input.mode === "refresh" && options.last_run) {
    const prev = unwrapLegacy(options.last_run);
    const prevProofs = Array.isArray(prev.meta?.proof_items) ? prev.meta.proof_items : [];
    const currentProofs = proofItems || [];
    const key = (item) => `${item.url || ""}:${item.signal_type || ""}`;
    const prevKeys = new Set(prevProofs.map(key));
    const currentKeys = new Set(currentProofs.map(key));
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

const generateAnatolyOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateAnatolyOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!payload.account_card) errors.push("account_card is required.");
  if (!payload.meta) errors.push("meta is required.");

  if (payload.account_card) {
    const checklist = payload.account_card.quick_audit_checklist || [];
    if (!Array.isArray(checklist) || checklist.length < 8 || checklist.length > 12) {
      errors.push("quick_audit_checklist must include 8-12 items.");
    } else {
      checklist.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          errors.push(`quick_audit_checklist[${index}] invalid`);
          return;
        }
        if (!["PASS", "WARN", "FAIL"].includes(item.status)) {
          errors.push(`quick_audit_checklist[${index}].status invalid`);
        }
        if (!Array.isArray(item.proof_refs)) {
          errors.push(`quick_audit_checklist[${index}].proof_refs required`);
        }
      });
    }
    const hooks = payload.account_card.top_personalization_hooks || [];
    if (
      (hooks.length < 3 || hooks.length > 5) &&
      payload.account_card.needsReview !== true
    ) {
      errors.push("top_personalization_hooks must be 3-5 items.");
    }
    if (hooks.length > 0) {
      hooks.forEach((hook, index) => {
        if (
          (!hook.related_proofs || hook.related_proofs.length === 0) &&
          payload.account_card.needsReview !== true
        ) {
          errors.push(`hook ${index} missing related_proofs`);
        }
        if (!hook.source_url) {
          errors.push(`hook ${index} missing source_url`);
        }
      });
    }
    const hypotheses = payload.account_card.pain_hypotheses || [];
    if (hypotheses.length > 0) {
      hypotheses.forEach((item, index) => {
        if (
          (!item.related_proofs || item.related_proofs.length === 0) &&
          payload.account_card.needsReview !== true
        ) {
          errors.push(`hypothesis ${index} missing related_proofs`);
        }
        if (!item.statement || !String(item.statement).includes("→")) {
          errors.push(`hypothesis ${index} must follow symptom→cause→solution→verification format`);
        }
      });
    }
    const contactability = payload.account_card.contactability;
    if (!contactability || typeof contactability !== "object") {
      errors.push("contactability is required");
    } else {
      if (
        typeof contactability.score_0_10 !== "number" ||
        contactability.score_0_10 < 0 ||
        contactability.score_0_10 > 10
      ) {
        errors.push("contactability.score_0_10 must be 0-10");
      }
      if (!contactability.estimate_basis) {
        errors.push("contactability.estimate_basis is required");
      }
    }
    const bestChannel = payload.account_card.best_channel_to_reach;
    if (!["", "TG", "VK", "WA", "email"].includes(bestChannel)) {
      errors.push("best_channel_to_reach must be TG/VK/WA/email or empty");
    }
    const avgCheck = payload.account_card.avg_check_estimate;
    if (avgCheck && typeof avgCheck === "object") {
      if (avgCheck.estimate !== true) {
        errors.push("avg_check_estimate.estimate must be true when provided");
      }
      if (!avgCheck.estimate_basis) {
        errors.push("avg_check_estimate.estimate_basis required");
      }
    }
  }

  if (payload.meta && Array.isArray(payload.meta.proof_items)) {
    payload.meta.proof_items.forEach((proof, index) => {
      if (proof.evidence_snippet && proof.evidence_snippet.length > 160) {
        errors.push(`proof ${index} evidence_snippet too long`);
      }
      if (proof.evidence_snippet && /<[^>]+>/.test(proof.evidence_snippet)) {
        errors.push(`proof ${index} evidence_snippet contains html`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
};

module.exports = {
  DEFAULT_PRODUCT_CONTEXT,
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  anatolyAgent,
  normalizeInput,
  generateOutput,
  generateAnatolyOutput,
  validateAnatolyOutput
};
