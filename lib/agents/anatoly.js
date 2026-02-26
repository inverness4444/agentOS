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
  language: "ru",
  raw_text: ""
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
    language: { type: "string", enum: ["ru"], default: "ru" },
    raw_text: { type: "string" }
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
Для company_analysis анализируй в первую очередь целевой сайт компании и его ключевые страницы.
Сторонний поиск используй только если сайт недоступен, и только как external_context.
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
const COMPANY_KEY_PATHS = [
  "/",
  "/product",
  "/products",
  "/pricing",
  "/prices",
  "/demo",
  "/pilot",
  "/cases",
  "/customers",
  "/about",
  "/contacts",
  "/blog",
  "/news",
  "/careers",
  "/vacancies"
];

const OFFICIAL_CHANNEL_HOSTS = new Set([
  "vk.com",
  "t.me",
  "telegram.me",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "rutube.ru",
  "dzen.ru",
  "hh.ru"
]);

const INVALID_TLD_HINTS = new Set([
  "html",
  "htm",
  "php",
  "asp",
  "aspx",
  "js",
  "css",
  "json",
  "xml",
  "txt"
]);

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
    company_domain_or_url: normalizeAbsoluteUrl(
      typeof safe.company_domain_or_url === "string" ? safe.company_domain_or_url.trim() : ""
    ),
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
    language: "ru",
    raw_text: typeof safe.raw_text === "string" ? safe.raw_text.slice(0, 8000) : ""
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

const normalizeAbsoluteUrl = (value) => {
  const raw = String(value || "")
    .trim()
    .replace(/[),.;!?]+$/g, "");
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^www\./i, "")}`;
  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    parsed.protocol = "https:";
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const labels = host.split(".").filter(Boolean);
    if (labels.length < 2) return "";
    const tld = labels[labels.length - 1] || "";
    if (!/^[a-z]{2,24}$/i.test(tld)) return "";
    if (INVALID_TLD_HINTS.has(tld.toLowerCase())) return "";
    parsed.hostname = host;
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return "";
  }
};

const getDomain = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const isSameDomainOrSubdomain = (url, baseDomain) => {
  if (!url || !baseDomain) return false;
  const domain = getDomain(url);
  if (!domain) return false;
  return domain === baseDomain || domain.endsWith(`.${baseDomain}`);
};

const isOfficialChannelHost = (url) => {
  const domain = getDomain(url);
  if (!domain) return false;
  if (OFFICIAL_CHANNEL_HOSTS.has(domain)) return true;
  return Array.from(OFFICIAL_CHANNEL_HOSTS).some((host) => domain.endsWith(`.${host}`));
};

const buildUrlByPath = (baseUrl, path) => {
  try {
    return canonicalize(new URL(path, baseUrl).toString());
  } catch {
    return "";
  }
};

const extractBrandToken = (input, targetDomain) => {
  const fromDomain = String(targetDomain || "")
    .split(".")[0]
    .replace(/[^a-zа-я0-9]+/gi, "")
    .toLowerCase();
  if (fromDomain.length >= 4) return fromDomain;

  const fromName = String(input.company_name || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s-]+/gi, " ")
    .split(/\s+/)
    .find((part) => part && part.length >= 4);

  return fromName || "";
};

const extractOfficialLinksFromPage = (html, baseUrl, targetDomain, brandToken = "") => {
  const safeHtml = String(html || "");
  if (!safeHtml) return [];
  const links = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match = null;
  while ((match = regex.exec(safeHtml))) {
    const href = String(match[1] || "").trim();
    if (!href) continue;
    let normalized = "";
    try {
      normalized = canonicalize(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
    if (!normalized) continue;
    if (isSameDomainOrSubdomain(normalized, targetDomain)) continue;
    if (!isOfficialChannelHost(normalized)) continue;
    if (brandToken) {
      const lower = normalized.toLowerCase();
      if (!lower.includes(brandToken)) continue;
    }
    links.push(normalized);
  }
  return [...new Set(links)];
};

const dedupeStrings = (items = []) => [...new Set(items.filter(Boolean))];

const URL_WITH_PROTOCOL_REGEX = /https?:\/\/[^\s)>"'`]+/gi;
const DOMAIN_LIKE_REGEX = /\b(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]{2,})+\b/gi;

const extractTargetUrlFromText = (text) => {
  const source = String(text || "");
  if (!source.trim()) return "";
  for (const match of source.matchAll(URL_WITH_PROTOCOL_REGEX)) {
    const normalized = normalizeAbsoluteUrl(match[0]);
    if (normalized) return normalized;
  }
  for (const match of source.matchAll(DOMAIN_LIKE_REGEX)) {
    const normalized = normalizeAbsoluteUrl(match[0]);
    if (normalized) return normalized;
  }
  return "";
};

const classifyChannelByUrl = (url) => {
  const domain = getDomain(url);
  if (!domain) return "other";
  if (domain.includes("vk.com")) return "vk";
  if (domain.includes("t.me") || domain.includes("telegram.me")) return "telegram";
  if (domain.includes("linkedin.com")) return "linkedin";
  if (domain.includes("hh.ru")) return "hh";
  if (domain.includes("youtube.com")) return "youtube";
  if (domain.includes("rutube.ru")) return "rutube";
  if (domain.includes("instagram.com")) return "instagram";
  if (domain.includes("facebook.com")) return "facebook";
  if (domain.includes("dzen.ru")) return "dzen";
  return "channel";
};

const dedupeByStatement = (items = []) => {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const key = String(item?.statement || item?.proposed_offer || "").trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
};

const deriveCompanyNameFromUrl = (url) => {
  const safe = canonicalize(url);
  if (!safe) return "";
  try {
    const host = new URL(safe).hostname.replace(/^www\./, "");
    const root = host.split(".").slice(0, -1).join(".") || host;
    return root
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
      .join(" ");
  } catch {
    return "";
  }
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

  const describeProof = (refs) => {
    if (!Array.isArray(refs) || refs.length === 0) return { detail: "Не найдено на проверенных страницах.", source_url: "" };
    const first = proofItems[refs[0]];
    if (!first) return { detail: "Не найдено на проверенных страницах.", source_url: "" };
    return {
      detail: sanitizeEvidenceSnippet(first.evidence_snippet || `${first.signal_type}: ${first.signal_value}`, 140),
      source_url: first.url || ""
    };
  };

  const buildCheck = (check, status, refs) => {
    const uniqueRefs = [...new Set((refs || []).filter((idx) => Number.isFinite(idx) && idx >= 0))];
    const proof = describeProof(uniqueRefs);
    return {
      check,
      status,
      proof_refs: uniqueRefs,
      detail: proof.detail,
      source_url: proof.source_url
    };
  };

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
  return checks
    .map((item) => buildCheck(item.check, item.status, item.proof_refs))
    .slice(0, 12);
};

const buildBaselineChecklist = () => [
  { check: "Есть официальный сайт или витрина", status: "WARN", proof_refs: [], detail: "Не проверено", source_url: "" },
  { check: "Оффер читается из публичного источника", status: "WARN", proof_refs: [], detail: "Не проверено", source_url: "" },
  { check: "Публичный email доступен", status: "FAIL", proof_refs: [], detail: "Не найдено", source_url: "" },
  { check: "Публичный телефон доступен", status: "FAIL", proof_refs: [], detail: "Не найдено", source_url: "" },
  { check: "Есть мессенджер для быстрого контакта", status: "FAIL", proof_refs: [], detail: "Не найдено", source_url: "" },
  { check: "Есть виджет/форма заявки", status: "FAIL", proof_refs: [], detail: "Не найдено", source_url: "" },
  { check: "Рейтинги/отзывы показывают клиентский поток", status: "WARN", proof_refs: [], detail: "Нет подтверждения", source_url: "" },
  { check: "Сигналов достаточно для персонализации", status: "FAIL", proof_refs: [], detail: "Недостаточно доказательств", source_url: "" }
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

const inferAudience = ({ proofItems = [], input = {}, pageTexts = [] }) => {
  const b2b = proofItems.find((item) => item.signal_type === "audience_b2b");
  const b2c = proofItems.find((item) => item.signal_type === "audience_b2c");
  if (b2b) return { value: "B2B", hypothesis: false, questions: [] };
  if (b2c) return { value: "B2C", hypothesis: false, questions: [] };

  const corpus = String(pageTexts.join(" ").toLowerCase());
  const hypotheses = [];
  if (/(сотрудник|команд|hr|people|персонал|вовлечен|стресс)/i.test(corpus)) {
    hypotheses.push("hypothesis: HRD/People Ops в компаниях с 50-1000 сотрудников");
  }
  if (/(поддержк|клиент|сервис|контакт-центр|колл-центр)/i.test(corpus)) {
    hypotheses.push("hypothesis: COO/руководители клиентского сервиса и контакт-центров");
  }
  if (/(b2b|корпоратив|для бизнеса|enterprise|компани)/i.test(corpus)) {
    hypotheses.push("hypothesis: B2B-команды, которым важны SLA и контроль качества процессов");
  }
  if (hypotheses.length === 0) {
    hypotheses.push("hypothesis: mid-market компании с распределёнными командами");
    hypotheses.push("hypothesis: операционные команды с высокой нагрузкой и текучкой");
    hypotheses.push("hypothesis: HR/COO, ищущие снижение выгорания и потерь персонала");
  }

  const questions = [
    "Кто экономический покупатель: HRD, COO или CEO?",
    "Какой порог по размеру компании и гео является приоритетным?",
    "Какой триггер покупки сильнее: текучка, выгорание, SLA клиентского сервиса?"
  ];

  return {
    value: hypotheses.slice(0, 3).join("; "),
    hypothesis: true,
    questions
  };
};

const buildAvgCheckEstimate = (proofItems = [], pageTexts = []) => {
  const refs = [];
  const prices = [];
  const regex = /(\d[\d\s]{2,7})\s?(₽|руб|rub)/gi;

  pageTexts.forEach((text, index) => {
    const safe = String(text || "");
    let match = null;
    while ((match = regex.exec(safe))) {
      const value = Number(String(match[1] || "").replace(/\s+/g, ""));
      if (Number.isFinite(value) && value > 0) {
        prices.push(value);
        refs.push(index);
      }
    }
  });

  if (prices.length === 0) {
    return {
      value_range_rub: "unknown",
      estimate: true,
      estimate_basis: "unknown_no_public_prices",
      proof_refs: [],
      required_for_estimate: [
        "Прайс/тарифы на сайте",
        "Средний чек по 20-30 сделкам",
        "Маржинальность и доля повторных покупок"
      ]
    };
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return {
    value_range_rub: `${min}-${max}`,
    estimate: true,
    estimate_basis: "based_on_public_prices",
    proof_refs: [...new Set(refs)].slice(0, 3)
  };
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

  const targetUrlFromText = extractTargetUrlFromText(input.raw_text);
  const normalizedTargetUrl = normalizeAbsoluteUrl(input.company_domain_or_url || targetUrlFromText);
  const targetDomain = getDomain(normalizedTargetUrl);
  const brandToken = extractBrandToken(input, targetDomain);

  const proofs = [];
  const limitations = [];
  const assumptions = [];
  const discovered = {};
  const contacts = { email: "", phone: "", messengers: [], widgets: [] };
  const officialChannels = new Set();
  const externalContext = [];
  const pageTexts = [];
  const visitedTargetPages = [];

  if (!normalizedTargetUrl) {
    limitations.push("Для company analysis нужен валидный URL сайта (с доменом).");
  }

  const maxPages = input.mode === "quick" ? 6 : 12;
  const pathSeeds = COMPANY_KEY_PATHS.slice(0, maxPages);
  const selectedUrls = normalizedTargetUrl
    ? dedupeStrings(pathSeeds.map((path) => buildUrlByPath(normalizedTargetUrl, path)).filter(Boolean))
    : [];

  for (const url of selectedUrls) {
    if (!isSameDomainOrSubdomain(url, targetDomain)) continue;
    const page = await webClient.fetchPage(url, { type: "page" });
    if ("blocked" in page) {
      limitations.push(`Страница недоступна: ${url}`);
      continue;
    }

    visitedTargetPages.push(page.url);
    pageTexts.push(page.text || "");
    const extracted = extractSignals(page, "website", input);
    extracted.proofs.forEach((proof) => {
      const canonicalProofUrl = canonicalize(proof.url);
      if (isSameDomainOrSubdomain(canonicalProofUrl, targetDomain)) {
        proofs.push({ ...proof, url: canonicalProofUrl, source_type: "website" });
      }
    });

    const outboundOfficial = extractOfficialLinksFromPage(page.html, page.url, targetDomain, brandToken);
    outboundOfficial.forEach((officialUrl) => officialChannels.add(officialUrl));

    if (!discovered.website) discovered.website = page.url;
    if (extracted.contacts.email && !contacts.email) contacts.email = extracted.contacts.email;
    if (extracted.contacts.phone && !contacts.phone) contacts.phone = extracted.contacts.phone;
    contacts.messengers = [...new Set([...contacts.messengers, ...extracted.contacts.messengers])];
    contacts.widgets = [...new Set([...contacts.widgets, ...extracted.contacts.widgets])];
  }

  if (visitedTargetPages.length === 0 && normalizedTargetUrl) {
    limitations.push("Целевой сайт недоступен для прямого разбора: использован ограниченный fallback-контекст.");
    const fallbackQueries = dedupeStrings(
      [
        targetDomain ? `site:${targetDomain}` : "",
        brandToken ? `${brandToken} официальный сайт` : "",
        brandToken ? `${brandToken} vk telegram hh` : ""
      ].filter(Boolean)
    ).slice(0, 3);
    for (const query of fallbackQueries) {
      const results = await webClient.search(query, "yandex", 5);
      results.forEach((item) => {
        const candidateUrl = normalizeAbsoluteUrl(item.url);
        if (!candidateUrl) return;
        const candidateDomain = getDomain(candidateUrl);
        if (!candidateDomain) return;
        if (isSameDomainOrSubdomain(candidateUrl, targetDomain)) {
          externalContext.push({
            type: "mirror_or_cache",
            url: candidateUrl,
            reason: "site_unavailable"
          });
          return;
        }
        if (isOfficialChannelHost(candidateUrl)) {
          externalContext.push({
            type: "external_context",
            url: candidateUrl,
            reason: "site_unavailable"
          });
        }
      });
    }
  }

  const proofItems = dedupeProofs(proofs)
    .filter((item) => isSameDomainOrSubdomain(item.url, targetDomain))
    .map((proof) => ({
      ...proof,
      evidence_snippet: sanitizeEvidenceSnippet(proof.evidence_snippet)
    }));

  if (input.require_proof && proofItems.length < 2 && input.allow_placeholders_if_blocked) {
    proofItems.push({
      url: normalizedTargetUrl || "https://example.com/",
      source_type: "website",
      title: "Insufficient data",
      signal_type: "insufficient_data",
      signal_value: "blocked_or_missing",
      evidence_snippet: "insufficient_data: limited access on target site"
    });
  }

  const hooks = buildHooks(proofItems, 5)
    .filter((hook) => isSameDomainOrSubdomain(hook.source_url, targetDomain))
    .slice(0, 5);

  while (hooks.length < 3 && proofItems[hooks.length]) {
    const idx = hooks.length;
    const proof = proofItems[idx];
    hooks.push({
      hook_text: `Сигнал: ${sanitizeEvidenceSnippet(proof.evidence_snippet, 100)} Источник: ${proof.url}`
        .replace(/\s+/g, " ")
        .trim(),
      related_proofs: [idx],
      proof_refs: [idx],
      source_url: proof.url
    });
  }

  let hypotheses = dedupeByStatement(buildHypotheses(proofItems, input.product_context)).slice(0, 3);
  while (hypotheses.length < 3) {
    hypotheses.push({
      statement:
        "Сигналов на сайте пока недостаточно → причина не подтверждена → мини-решение: аудит воронки и CTA (AgentOS) → нужны метрики воронки и примеры диалогов",
      symptom: "Недостаточно подтверждённых сигналов",
      cause: "Ограниченный объём доступных данных на сайте",
      mini_solution: "Аудит воронки и CTA (AgentOS)",
      verification_needed: "Нужны метрики воронки, скорость ответа и примеры обращений",
      related_proofs: [],
      proposed_offer: "Аудит воронки и CTA (AgentOS)",
      expected_outcome_estimate: "Требуется подтверждение на данных",
      estimate_basis: "insufficient_data"
    });
  }
  hypotheses = hypotheses.slice(0, 3);

  const quickWins = dedupeStrings(buildQuickWins(hypotheses).map((item) => String(item || "").trim())).slice(0, 3);
  const quickAuditChecklist = buildQuickAuditChecklist(proofItems, contacts);
  const contactability = buildContactability(contacts, discovered);

  const offerProof = proofItems.find((item) => item.signal_type === "offer");
  const whatTheySell = offerProof ? String(offerProof.signal_value || "") : "";
  const audience = inferAudience({ proofItems, input, pageTexts });
  if (audience.hypothesis) {
    assumptions.push("who_they_sell_to определено как hypothesis; требуется подтверждение на интервью/данных.");
  }

  if (audience.questions.length > 0) {
    quickWins.push(`Вопросы для подтверждения ICP: ${audience.questions.join(" | ")}`);
  }

  const primaryUrl = normalizedTargetUrl || discovered.website || "";
  const companyName =
    input.company_name ||
    deriveCompanyNameFromUrl(primaryUrl) ||
    (offerProof ? String(offerProof.signal_value) : "");

  const avgCheckEstimate = buildAvgCheckEstimate(
    proofItems,
    pageTexts
  );

  if (avgCheckEstimate.value_range_rub === "unknown") {
    limitations.push("На целевом сайте не найдены публичные цены/тарифы; avg check = unknown.");
  }

  const officialByType = {};
  Array.from(officialChannels).forEach((url) => {
    const key = classifyChannelByUrl(url);
    if (!officialByType[key]) {
      officialByType[key] = [];
    }
    officialByType[key].push(url);
  });
  Object.keys(officialByType).forEach((key) => {
    officialByType[key] = dedupeStrings(officialByType[key]).slice(0, 3);
  });

  const safeSources = dedupeStrings([
    primaryUrl,
    ...visitedTargetPages,
    ...Array.from(officialChannels)
  ])
    .filter((url) => {
      if (isSameDomainOrSubdomain(url, targetDomain)) return true;
      return officialChannels.has(url);
    })
    .slice(0, 20);

  const needsReview = proofItems.length < 3 || limitations.length > 0 || visitedTargetPages.length === 0;
  const stats = webClient.getStats();
  const trace = webClient.getTrace();

  const output = {
    account_card: {
      company_name: companyName,
      primary_url: primaryUrl,
      discovered_channels: {
        website: primaryUrl || "",
        ...officialByType
      },
      what_they_sell: whatTheySell || "",
      who_they_sell_to: audience.value || "",
      avg_check_estimate: avgCheckEstimate,
      quick_audit_checklist: quickAuditChecklist,
      top_personalization_hooks: hooks,
      pain_hypotheses: hypotheses,
      quick_wins: dedupeStrings(quickWins).slice(0, 3),
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
      target_domain: targetDomain || "",
      primary_url: primaryUrl,
      user_facing_sources: safeSources,
      official_channels: Array.from(officialChannels).slice(0, 10),
      external_context: externalContext,
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
      limitations: dedupeStrings(limitations),
      assumptions: dedupeStrings(assumptions)
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
