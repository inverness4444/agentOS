const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const { stableTextFingerprint } = require("../../utils/scoring.js");
const { extractFromHtml } = require("../../extractors");
const { getLLMProvider } = require("../llm/provider.js");

const inputDefaults = {
  mode: "deep",
  workflow_mode: "potential_clients",
  search_target: "buyer_only",
  geo_scope: "cis",
  has_web_access: true,
  max_web_requests: null,
  focus: "mixed",
  geo: "",
  query_text: "",
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
    workflow_mode: {
      type: "string",
      enum: ["auto", "potential_clients", "hot_signals", "rank_provided_list"],
      default: "auto"
    },
    search_target: {
      type: "string",
      enum: ["buyer_only", "competitor_scan"],
      default: "buyer_only"
    },
    geo_scope: {
      type: "string",
      enum: ["cis", "global"],
      default: "cis"
    },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    focus: {
      type: "string",
      enum: ["wb_ozon", "marketing", "automation", "chatbots", "crm", "mixed"],
      default: "mixed"
    },
    geo: { type: "string", default: "" },
    query_text: { type: "string" },
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
  required: ["mode", "workflow_mode", "search_target", "geo_scope", "has_web_access"],
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

const systemPrompt = `Ты — ИИ-агент agentOS: "Артём — Горячие лиды".
Цель: находить потенциальных покупателей (организации/ЛПР) и сигналы потребности, а не контент по теме.
Фокус:
1) Hot leads: есть явный buying signal (тендер/закупка/вакансия/пост "ищем/нужно/выбираем/внедряем").
2) Warm targets: совпадают с ICP, но без явного сигнала покупки.
3) Режим по умолчанию buyer_only: ищи покупателей, а не вендоров/конкурентов.
Запрет:
- не выдавай статьи, обзоры, словари, форумы и Q&A как лиды;
- не подменяй лидоген контент-дискавери;
- не выдумывай контакты и персональные данные.
Разрешено использовать только публичные источники без серого парсинга, обхода капчи и скрытых API.`;

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

const runWithTimeout = async (promise, timeoutMs, errorCode) => {
  const ms = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const error = new Error(errorCode || "TIMEOUT");
        error.code = errorCode || "TIMEOUT";
        reject(error);
      }, ms);
    })
  ]);
};

const normalizeKeywords = (keywords) =>
  Array.isArray(keywords)
    ? keywords
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const normalizeWhitespace = (value) =>
  String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

const trimPromptArtifacts = (value) => {
  const source = normalizeWhitespace(value);
  if (!source) return "";
  const withoutContext = source.split(/\n\nКонтекст диалога:/i)[0] || source;
  const withoutAttachments = withoutContext.split(/\n\nВложения пользователя:/i)[0] || withoutContext;
  return normalizeWhitespace(withoutAttachments);
};

const resolveUserTaskText = (safe) => {
  const candidates = [
    safe.query_text,
    safe.user_text,
    safe.input_text,
    safe.prompt,
    safe.task,
    safe.text
  ]
    .map((item) => trimPromptArtifacts(item))
    .filter(Boolean);
  return candidates[0] || "";
};

const TERM_STOPWORDS = new Set([
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
  "как",
  "чтобы",
  "чтоб",
  "или",
  "а",
  "но",
  "да",
  "нет",
  "найди",
  "найти",
  "сделай",
  "сделать",
  "помоги",
  "помогите",
  "почему",
  "нужно",
  "надо",
  "можно",
  "хочу",
  "нужен",
  "нужна",
  "нужны",
  "ищем",
  "ищу",
  "под",
  "из",
  "до",
  "от",
  "за",
  "без",
  "не",
  "ли",
  "же",
  "бы",
  "то",
  "что",
  "где",
  "когда",
  "кто",
  "какой",
  "какая",
  "какие",
  "site",
  "лид",
  "лиды",
  "лидов",
  "горячий",
  "горячие",
  "горячих",
  "суть",
  "моего",
  "моей",
  "моему",
  "сайта",
  "сайт"
]);

const BASE_BUYING_SIGNAL_LEXICON = {
  ru: [
    "ищем",
    "нужно",
    "нужен",
    "выбираем",
    "подбираем",
    "внедряем",
    "закупка",
    "тендер",
    "конкурс",
    "кп",
    "коммерческое предложение",
    "поставщик",
    "подрядчик",
    "платформа",
    "сервис",
    "решение",
    "демо",
    "цена",
    "стоимость",
    "тариф",
    "интеграция",
    "подключить",
    "купить"
  ],
  en: [
    "looking for",
    "need",
    "choose",
    "select",
    "implement",
    "procurement",
    "tender",
    "rfp",
    "vendor",
    "platform",
    "service",
    "solution",
    "demo",
    "pricing",
    "cost",
    "integration",
    "buy"
  ]
};

const BASE_NEGATIVE_LEXICON = {
  ru: [
    "что такое",
    "словарь",
    "энциклопедия",
    "форум",
    "remote desktop",
    "anydesk",
    "cybersecurity",
    "password",
    "error",
    "hack",
    "server"
  ],
  en: [
    "dictionary",
    "cambridge",
    "oxford",
    "definition",
    "forum",
    "q&a",
    "zhihu",
    "quora",
    "stackoverflow",
    "reddit",
    "password",
    "error",
    "hack",
    "server",
    "remote desktop",
    "anydesk",
    "cybersecurity"
  ]
};

const DEFAULT_INDUSTRIES_RU = [
  "e-commerce",
  "ритейл",
  "логистика",
  "производство",
  "образование",
  "медицина",
  "финансы",
  "it-аутсорс",
  "строительство",
  "услуги"
];

const DEFAULT_INDUSTRIES_EN = [
  "ecommerce",
  "retail",
  "logistics",
  "manufacturing",
  "education",
  "healthcare",
  "finance",
  "it services",
  "construction",
  "professional services"
];

const DEFAULT_ROLES_RU = [
  "руководитель",
  "директор",
  "операционный директор",
  "маркетинг",
  "продажи",
  "hr",
  "закупки",
  "it",
  "коммерческий директор",
  "владелец"
];

const DEFAULT_ROLES_EN = [
  "head of operations",
  "marketing lead",
  "sales lead",
  "hr manager",
  "procurement manager",
  "it manager",
  "growth lead",
  "coo",
  "cmo",
  "owner"
];

const FIXED_LPR_ROLES_RU = [
  "HRD/Директор по персоналу",
  "Head of People/People Ops",
  "HRBP",
  "CEO/ГенДиректор",
  "COO/Операционный директор",
  "Руководитель службы охраны труда/ПБ (если релевантно)",
  "Руководитель корпоративных коммуникаций",
  "CFO (если закупка)"
];

const FIXED_LPR_ROLES_EN = [
  "HR Director",
  "Head of People/People Ops",
  "HR Business Partner",
  "CEO",
  "COO",
  "Head of Health & Safety (if relevant)",
  "Head of Internal Communications",
  "CFO (for procurement)"
];

const BUYER_SIGNAL_MARKERS = [
  "ищем",
  "нужно",
  "нужен",
  "выбираем",
  "подбираем",
  "внедряем",
  "тендер",
  "закупка",
  "конкурс",
  "кп",
  "коммерческое предложение",
  "rfp",
  "request for proposal",
  "вакансия",
  "вакансии",
  "ищем подрядчика",
  "ищем поставщика",
  "посоветуйте",
  "looking for",
  "need",
  "selecting",
  "procurement",
  "vendor shortlist"
];

const HOT_SIGNAL_MARKERS = [...new Set(BUYER_SIGNAL_MARKERS)];

const VENDOR_SIGNAL_MARKERS = [
  "тариф",
  "тарифы",
  "цены",
  "цена",
  "pricing",
  "price",
  "demo",
  "демо",
  "наш сервис",
  "мы предлагаем",
  "возможности",
  "интеграции",
  "кейсы клиентов",
  "клиентские кейсы",
  "платформа для",
  "our platform",
  "features",
  "integrations",
  "book a demo",
  "request demo",
  "оставить заявку",
  "оставьте заявку",
  "получить демо",
  "продукт",
  "product overview"
];

const VENDOR_NEGATIVE_KEYWORDS = [
  "цены",
  "тарифы",
  "демо",
  "наш сервис",
  "платформа",
  "решение",
  "возможности",
  "интеграции",
  "кейсы",
  "pricing",
  "features",
  "integrations",
  "request demo",
  "book a demo"
];

const ENTITY_ROLES = ["buyer", "vendor", "media", "directory", "other"];

const CONTACT_SIGNAL_MARKERS = [
  "контакт",
  "контакты",
  "форма",
  "заявка",
  "оставьте",
  "напишите",
  "email",
  "e-mail",
  "почта",
  "telegram",
  "телеграм",
  "vk",
  "whatsapp",
  "ватсап"
];

const GEO_MARKERS = [
  "россия",
  "снг",
  "москва",
  "санкт-петербург",
  "спб",
  "казань",
  "екатеринбург",
  "новосибирск",
  "минск",
  "алматы",
  "беларусь",
  "казахстан",
  "узбекистан"
];

const RELEVANCE_NOISE_MARKERS = [
  "anydesk",
  "remote desktop",
  "rdp",
  "vpn",
  "cybersecurity",
  "malware",
  "antivirus",
  "reddit",
  "quora",
  "wikipedia",
  "zhihu"
];

const RELEVANCE_DROP_THRESHOLD = 70;
const RELEVANCE_THRESHOLD = 75;
const HOT_THRESHOLD = 80;
const HOT_INTENT_THRESHOLD = 70;
const MIN_QUERY_COUNT = 30;
const MAX_QUERY_COUNT_QUICK = 40;
const MAX_QUERY_COUNT_DEEP = 80;
const SCORING_CHUNK_SIZE = 12;

const BLOCKED_DOMAIN_MARKERS = [
  "answers.microsoft.com",
  "support.google.com"
];

const BLOCKED_PATH_MARKERS = [
  "/help",
  "/support",
  "/docs",
  "/documentation",
  "/kb/",
  "/knowledge-base",
  "/faq",
  "/glossary",
  "/dictionary"
];

const NEWS_HOST_MARKERS = ["news.", "ria.ru", "lenta.ru", "tass.ru", "interfax.ru", "rbc.ru"];

const HOT_SOURCE_ALLOWLIST_MARKERS = [
  "hh.ru",
  "superjob.ru",
  "zarplata.ru",
  "trudvsem.ru",
  "zakupki.gov.ru",
  "b2b-center.ru",
  "rostender.info",
  "tender.pro",
  "vk.com",
  "t.me"
];

const SOURCE_TYPES = [
  "tender",
  "job",
  "social_post",
  "directory",
  "company_page",
  "blog/article",
  "forum/qna",
  "dictionary",
  "other"
];

const LEAD_VISIBLE_SOURCE_TYPES = new Set([
  "tender",
  "job",
  "social_post",
  "directory",
  "company_page"
]);

const CIS_COUNTRIES_RU = [
  "Россия",
  "Беларусь",
  "Казахстан",
  "Украина",
  "Узбекистан",
  "Армения",
  "Азербайджан",
  "Грузия",
  "Кыргызстан",
  "Молдова",
  "Таджикистан",
  "Туркменистан"
];

const CIS_QUERY_MARKERS_RU = ["Россия", "РФ", "Казахстан", "Беларусь", "СНГ"];
const CIS_QUERY_MARKERS_EN = ["Russia", "Kazakhstan", "Belarus", "CIS"];

const CIS_GEO_MARKERS = [
  "снг",
  "cis",
  "россия",
  "рф",
  "russia",
  "беларусь",
  "belarus",
  "казахстан",
  "kazakhstan",
  "украина",
  "ukraine",
  "узбекистан",
  "uzbekistan",
  "армения",
  "armenia",
  "азербайджан",
  "azerbaijan",
  "грузия",
  "georgia",
  "кыргызстан",
  "kyrgyzstan",
  "молдова",
  "moldova",
  "таджикистан",
  "tajikistan",
  "туркменистан",
  "turkmenistan",
  "москва",
  "санкт-петербург",
  "минск",
  "алматы",
  "астана",
  "ташкент",
  "ереван",
  "баку",
  "тбилиси",
  "бишкек",
  "душанбе",
  "ашхабад"
];

const CIS_TLD_ALLOWLIST = new Set([
  "ru",
  "su",
  "by",
  "kz",
  "ua",
  "uz",
  "am",
  "az",
  "ge",
  "kg",
  "md",
  "tj",
  "tm"
]);

const GLOBAL_SCOPE_MARKERS = ["global", "worldwide", "international", "весь мир", "глобально"];

const NON_CIS_COUNTRY_MARKERS = [
  "germany",
  "deutschland",
  "германия",
  "de",
  "usa",
  "u.s.",
  "сша",
  "united states",
  "uk",
  "united kingdom",
  "британия",
  "france",
  "франция",
  "italy",
  "италия",
  "spain",
  "испания",
  "poland",
  "польша",
  "turkey",
  "турция",
  "uae",
  "oae",
  "оаэ",
  "emirates",
  "india",
  "индия",
  "china",
  "китай",
  "japan",
  "япония",
  "brazil",
  "бразилия",
  "mexico",
  "мексика",
  "canada",
  "канада",
  "australia",
  "австралия"
];

const COUNTRY_TLD_HINTS = {
  germany: ["de"],
  deutschland: ["de"],
  германия: ["de"],
  usa: ["us"],
  "united states": ["us"],
  сша: ["us"],
  uk: ["uk"],
  "united kingdom": ["uk"],
  британия: ["uk"],
  france: ["fr"],
  франция: ["fr"],
  italy: ["it"],
  италия: ["it"],
  spain: ["es"],
  испания: ["es"],
  poland: ["pl"],
  польша: ["pl"],
  turkey: ["tr"],
  турция: ["tr"],
  uae: ["ae"],
  oae: ["ae"],
  оаэ: ["ae"],
  india: ["in"],
  индия: ["in"],
  china: ["cn"],
  китай: ["cn"],
  japan: ["jp"],
  япония: ["jp"],
  brazil: ["br"],
  бразилия: ["br"],
  mexico: ["mx"],
  мексика: ["mx"],
  canada: ["ca"],
  канада: ["ca"],
  australia: ["au"],
  австралия: ["au"],
  russia: ["ru"],
  россия: ["ru"],
  belarus: ["by"],
  беларусь: ["by"],
  kazakhstan: ["kz"],
  казахстан: ["kz"],
  ukraine: ["ua"],
  украина: ["ua"],
  uzbekistan: ["uz"],
  узбекистан: ["uz"],
  armenia: ["am"],
  армения: ["am"],
  azerbaijan: ["az"],
  азербайджан: ["az"],
  georgia: ["ge"],
  грузия: ["ge"],
  kyrgyzstan: ["kg"],
  кыргызстан: ["kg"],
  moldova: ["md"],
  молдова: ["md"],
  tajikistan: ["tj"],
  таджикистан: ["tj"],
  turkmenistan: ["tm"],
  туркменистан: ["tm"]
};

const getUrlDomain = (url) => {
  try {
    return new URL(String(url || "")).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const getUrlTld = (url) => {
  const host = getUrlDomain(url);
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
};

const hasAnyMarker = (text, markers) => {
  const lower = String(text || "").toLowerCase();
  return Array.isArray(markers) && markers.some((marker) => lower.includes(String(marker).toLowerCase()));
};

const inferGeoScopeFromText = ({ inputGeoScope, language, taskText, geoCandidates = [] }) => {
  const preferred = String(inputGeoScope || "").toLowerCase();
  if (preferred === "global") {
    return {
      geo_scope: "global",
      geo_terms: ["Global"],
      assumptions: []
    };
  }

  const combined = [taskText, ...geoCandidates].join(" ").toLowerCase();
  if (hasAnyMarker(combined, GLOBAL_SCOPE_MARKERS)) {
    return {
      geo_scope: "global",
      geo_terms: ["Global"],
      assumptions: ["geo_scope_global_explicit"]
    };
  }

  const explicitNonCis = NON_CIS_COUNTRY_MARKERS.filter((marker) =>
    combined.includes(String(marker).toLowerCase())
  );
  if (explicitNonCis.length > 0) {
    return {
      geo_scope: "custom",
      geo_terms: [...new Set(explicitNonCis.map((item) => normalizePhrase(item, 60)).filter(Boolean))].slice(0, 6),
      assumptions: ["geo_scope_custom_explicit_country"]
    };
  }

  if (preferred === "cis" || language === "ru" || !combined.trim()) {
    return {
      geo_scope: "cis",
      geo_terms: [...CIS_COUNTRIES_RU],
      assumptions: language === "ru" ? ["geo_scope_default_cis_ru"] : ["geo_scope_default_cis"]
    };
  }

  return {
    geo_scope: "cis",
    geo_terms: [...CIS_COUNTRIES_RU],
    assumptions: ["geo_scope_default_cis"]
  };
};

const buildGeoProfile = ({ geoScope, geoTerms, language }) => {
  const scope = String(geoScope || "cis").toLowerCase() === "global" ? "global" : String(geoScope || "cis").toLowerCase() === "custom" ? "custom" : "cis";
  const normalizedTerms = toStringList(Array.isArray(geoTerms) ? geoTerms : [], 12, 80);
  if (scope === "global") {
    return {
      geo_scope: "global",
      markers: [],
      tld_allowlist: null,
      query_clause: "",
      terms: normalizedTerms.length ? normalizedTerms : ["Global"]
    };
  }
  if (scope === "custom") {
    const markers = normalizedTerms.map((item) => String(item || "").toLowerCase()).filter(Boolean);
    const tldSet = new Set();
    markers.forEach((marker) => {
      const hints = COUNTRY_TLD_HINTS[marker];
      if (Array.isArray(hints)) hints.forEach((tld) => tldSet.add(String(tld).toLowerCase()));
    });
    const queryClause =
      markers.length > 0 ? `(${markers.slice(0, 5).join(" OR ")})` : "";
    return {
      geo_scope: "custom",
      markers,
      tld_allowlist: tldSet.size > 0 ? tldSet : null,
      query_clause: queryClause,
      terms: normalizedTerms
    };
  }
  return {
    geo_scope: "cis",
    markers: [...CIS_GEO_MARKERS],
    tld_allowlist: new Set(CIS_TLD_ALLOWLIST),
    query_clause:
      language === "en"
        ? `(${CIS_QUERY_MARKERS_EN.join(" OR ")})`
        : `(${CIS_QUERY_MARKERS_RU.join(" OR ")})`,
    terms: normalizedTerms.length > 0 ? normalizedTerms : [...CIS_COUNTRIES_RU]
  };
};

const isRussianLikeText = (text) => {
  const detected = detectLanguage(text);
  return detected === "ru";
};

const evaluateGeoScopeFit = ({ url, title, snippet, pageText, geoProfile }) => {
  const scope = geoProfile?.geo_scope || "cis";
  const domain = getUrlDomain(url);
  const tld = getUrlTld(url);
  const combinedShort = `${title || ""} ${snippet || ""}`;
  const combinedLong = `${combinedShort} ${String(pageText || "").slice(0, 2500)}`;

  if (scope === "global") {
    return { allowed: true, reason: "global_scope", domain, tld };
  }

  const hasMarker = hasAnyMarker(combinedLong, geoProfile?.markers || []);
  const hasRuLanguage = isRussianLikeText(combinedLong);
  const tldAllowlist = geoProfile?.tld_allowlist;
  const tldAllowed = Boolean(tldAllowlist && tld && tldAllowlist.has(tld));

  if (tldAllowed) {
    return { allowed: true, reason: "geo_tld_allowlist", domain, tld };
  }
  if (hasMarker) {
    return { allowed: true, reason: "geo_marker_detected", domain, tld };
  }
  if (scope === "custom") {
    return {
      allowed: false,
      reason: "outside geo",
      domain,
      tld
    };
  }
  if (hasRuLanguage) {
    return { allowed: true, reason: "geo_ru_language_detected", domain, tld };
  }

  return {
    allowed: false,
    reason: "outside geo",
    domain,
    tld
  };
};

const normalizeUsage = (usage) => {
  const promptTokens = Number(usage?.prompt_tokens);
  const completionTokens = Number(usage?.completion_tokens);
  const totalTokens = Number(usage?.total_tokens);
  return {
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    total_tokens: Number.isFinite(totalTokens)
      ? totalTokens
      : (Number.isFinite(promptTokens) ? promptTokens : 0) +
        (Number.isFinite(completionTokens) ? completionTokens : 0)
  };
};

const addUsage = (acc, usage) => {
  const safe = normalizeUsage(usage);
  return {
    prompt_tokens: Number(acc?.prompt_tokens || 0) + safe.prompt_tokens,
    completion_tokens: Number(acc?.completion_tokens || 0) + safe.completion_tokens,
    total_tokens: Number(acc?.total_tokens || 0) + safe.total_tokens
  };
};

const toStringList = (value, maxItems = 20, maxChars = 120) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  const blocked = new Set([
    "stub",
    "none",
    "null",
    "undefined",
    "example",
    "example.com",
    "n/a",
    "-"
  ]);
  value.forEach((item) => {
    if (result.length >= maxItems) return;
    const normalized = normalizePhrase(item, maxChars);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (blocked.has(key)) return;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
};

const NOISE_TOKEN_HINTS = [
  "anydesk",
  "remote",
  "desktop",
  "rdp",
  "cybersecurity",
  "malware",
  "antivirus",
  "vpn",
  "reddit",
  "quora",
  "wikipedia",
  "zhihu"
];

const normalizeTerm = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^\p{L}\p{N}._ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenizeTerms = (value) =>
  normalizeTerm(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 50)
    .filter((token) => !TERM_STOPWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token));

const normalizePhrase = (value, max = 120) =>
  normalizeWhitespace(value)
    .replace(/[^\p{L}\p{N}._:/"' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const detectLanguage = (text) => {
  const source = String(text || "");
  if (!source.trim()) return "mixed";
  const cyrillic = (source.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (source.match(/[A-Za-z]/g) || []).length;
  if (cyrillic > latin * 1.4) return "ru";
  if (latin > cyrillic * 1.4) return "en";
  return "mixed";
};

const detectSourceKind = (url, text = "") => {
  const lowerUrl = String(url || "").toLowerCase();
  const lowerText = String(text || "").toLowerCase();
  const merged = `${lowerUrl} ${lowerText}`;

  if (
    /wiktionary|wikipedia|dictionary|glossary|\/glossary|\/dictionary|словар|энциклопед/i.test(
      merged
    )
  ) {
    return "dictionary";
  }

  if (
    /quora|reddit|zhihu|stackexchange|stackoverflow|forum|community discussion|q&a|questions and answers/i.test(
      merged
    )
  ) {
    return "forum/qna";
  }

  if (
    /\/blog\/|\/article|\/articles|\/news\/|medium\.com|habr\.com|vc\.ru\/.+\/\d+/.test(merged)
  ) {
    return "blog/article";
  }

  if (
    /hh\.ru|superjob\.ru|trudvsem|zarplata|\/vacancy|ваканс/.test(
      merged
    )
  ) {
    return "job";
  }
  if (
    /zakupk|tender|тендер|\/tenders?|\/purchase|b2b-center/.test(
      merged
    )
  ) {
    return "tender";
  }
  if (/vk\.com\/wall|vk\.com\/public|t\.me\/s\/|linkedin\.com\/posts\//.test(lowerUrl)) {
    return "social_post";
  }
  if (
    /yandex\.ru\/maps|2gis|flamp|yell\.ru|google\.com\/maps|g2\.com|clutch\.co|catalog|directory|listing/i.test(
      merged
    )
  ) {
    return "directory";
  }
  if (/^https?:\/\/[^/]+\/?$/.test(lowerUrl) || /\/contacts?|\/about|\/company|\/pricing/.test(lowerUrl)) {
    return "company_page";
  }
  if (/\/wiki|\/doc|\/help|\/support/.test(lowerUrl)) {
    return "other";
  }
  return "company_page";
};

const isBlockedSource = (url, title = "", snippet = "") => {
  const lowerUrl = String(url || "").toLowerCase();
  const lowerTitle = String(title || "").toLowerCase();
  const lowerSnippet = String(snippet || "").toLowerCase();

  if (BLOCKED_DOMAIN_MARKERS.some((marker) => lowerUrl.includes(marker))) {
    return { blocked: true, reason: "blocked_domain_noise" };
  }

  if (BLOCKED_PATH_MARKERS.some((marker) => lowerUrl.includes(marker))) {
    return { blocked: true, reason: "blocked_docs_support" };
  }

  const fullText = `${lowerTitle} ${lowerSnippet}`;

  if (
    NEWS_HOST_MARKERS.some((marker) => lowerUrl.includes(marker)) &&
    !hasExplicitIntentSignal(fullText)
  ) {
    return { blocked: true, reason: "source_type_drop_blog_article" };
  }

  return { blocked: false, reason: "" };
};

const isHotSourceAllowed = (url, sourceKind) => {
  const lowerUrl = String(url || "").toLowerCase();
  if (sourceKind === "job" || sourceKind === "tender" || sourceKind === "social_post") {
    return true;
  }
  return HOT_SOURCE_ALLOWLIST_MARKERS.some((marker) => lowerUrl.includes(marker));
};

const extractCompanyOrOrganization = ({ title, snippet, url }) => {
  const text = `${title || ""} ${snippet || ""}`;
  const legalMatch = text.match(
    /\b(ООО|АО|ПАО|ИП|LLC|Inc\.?|Ltd\.?|Corp\.?)\s*[«"“]?([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9 .&_-]{1,70})/i
  );
  if (legalMatch) {
    const first = normalizePhrase(legalMatch[1], 20);
    const second = normalizePhrase(legalMatch[2], 80);
    return normalizePhrase(`${first} ${second}`, 90);
  }

  const vacancyMatch = String(title || "").match(/(.+?)\s*(?:[-—|]\s*ваканси|ваканси)/i);
  if (vacancyMatch) {
    return normalizePhrase(vacancyMatch[1], 90);
  }

  try {
    const host = new URL(String(url || "")).hostname.replace(/^www\./, "");
    const root = host.split(".").slice(0, -1).join(".");
    if (root && !/^(news|support|docs|help|blog|forum|community)$/i.test(root)) {
      return normalizePhrase(root, 90);
    }
  } catch {
    // no-op
  }

  return "";
};

const extractDomainsFromText = (value) => {
  const source = String(value || "").toLowerCase();
  const domains = [];
  const seen = new Set();
  const regex = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
  for (const match of source.matchAll(regex)) {
    const domain = normalizeTerm(match[1]);
    if (!domain || !domain.includes(".")) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  return domains;
};

const extractQuotedPhrases = (value) => {
  const source = String(value || "");
  const matches = [];
  const seen = new Set();
  const regex = /["«“]([^"»”]{4,120})["»”]/g;
  for (const match of source.matchAll(regex)) {
    const phrase = normalizePhrase(match[1], 120);
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(phrase);
  }
  return matches;
};

const extractPhrasesByMarkers = (value, markers) => {
  const source = String(value || "");
  const phrases = [];
  const seen = new Set();

  for (const marker of markers) {
    const regex = new RegExp(`${marker}\\s+([^,.;\\n]{4,120})`, "gi");
    for (const match of source.matchAll(regex)) {
      const phrase = normalizePhrase(match[1], 120);
      if (!phrase) continue;
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      phrases.push(phrase);
    }
  }
  return phrases;
};

const extractHotSignalsFromText = (value) => {
  const source = normalizeTerm(value);
  return HOT_SIGNAL_MARKERS.filter((marker) => source.includes(marker));
};

const extractGeoFromText = (value, fallbackGeo = "") => {
  const source = normalizeTerm(value);
  const hints = GEO_MARKERS.filter((marker) => source.includes(marker));
  const geo = normalizePhrase(fallbackGeo, 80);
  if (geo) hints.unshift(geo);
  return [...new Set(hints.filter(Boolean))].slice(0, 3);
};

const extractConstraints = (value) => {
  const source = String(value || "");
  const constraints = [];
  const seen = new Set();
  const patterns = [
    /(\d+\s*[-–]\s*\d+\s*(?:сотрудник|человек|точек|филиал))/gi,
    /(\d+\+?\s*(?:сотрудник|человек|точек|филиал))/gi,
    /(b2b|b2c|d2c)/gi,
    /(малый бизнес|средний бизнес|enterprise|корпоратив)/gi,
    /(wb|wildberries|ozon|маркетплейс)/gi
  ];
  patterns.forEach((regex) => {
    for (const match of source.matchAll(regex)) {
      const phrase = normalizePhrase(match[1], 80);
      if (!phrase) continue;
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      constraints.push(phrase);
    }
  });
  return constraints.slice(0, 8);
};

const extractIntentHeuristic = (input) => {
  const taskText = resolveUserTaskText(input);
  const keywords = normalizeKeywords(input.keywords).map((item) => normalizePhrase(item, 80));
  const domains = [
    ...extractDomainsFromText(taskText),
    ...keywords.filter((item) => item.includes("."))
  ].filter(Boolean);
  const uniqueDomains = [...new Set(domains.map((item) => item.toLowerCase()))];
  const quoted = extractQuotedPhrases(taskText);
  const productPhrases = extractPhrasesByMarkers(taskText, [
    "сервис",
    "продукт",
    "услуга",
    "инструмент",
    "платформа",
    "сайт",
    "бот",
    "решение"
  ]);
  const icpPhrases = extractPhrasesByMarkers(taskText, [
    "для",
    "клиенты",
    "целевая аудитория",
    "ца",
    "для компаний",
    "для бизнеса"
  ]);
  const geoHints = extractGeoFromText(taskText, input.geo);
  const constraints = extractConstraints(taskText);
  const hotSignals = extractHotSignalsFromText(taskText);
  const taskTerms = tokenizeTerms(taskText);
  const keywordTerms = keywords.flatMap((item) => tokenizeTerms(item));
  const primaryTerms = [
    ...quoted,
    ...productPhrases,
    ...icpPhrases,
    ...constraints,
    ...keywords,
    ...taskTerms.slice(0, 18)
  ]
    .map((item) => normalizePhrase(item, 90))
    .filter(Boolean);
  const uniquePrimaryTerms = [...new Set(primaryTerms.map((item) => item.toLowerCase()))]
    .map((lower) => {
      const match = primaryTerms.find((item) => item.toLowerCase() === lower);
      return match || lower;
    })
    .slice(0, 24);

  const termTokens = new Set([
    ...taskTerms,
    ...keywordTerms,
    ...uniqueDomains.flatMap((item) => tokenizeTerms(item)),
    ...uniquePrimaryTerms.flatMap((item) => tokenizeTerms(item)),
    ...hotSignals.flatMap((item) => tokenizeTerms(item)),
    ...geoHints.flatMap((item) => tokenizeTerms(item))
  ]);

  return {
    task_text: taskText,
    product_or_service: [...new Set([...quoted, ...productPhrases, ...keywords])].slice(0, 10),
    icp: [...new Set(icpPhrases)].slice(0, 10),
    geo: geoHints,
    constraints,
    hot_signals: hotSignals,
    domains: uniqueDomains,
    primary_terms: uniquePrimaryTerms,
    term_tokens: [...termTokens]
  };
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const explicitRawText = normalizeWhitespace(safe.raw_text || safe.prompt || safe.task || safe.text || "");
  const mode =
    safe.mode === "quick" || safe.mode === "continue" || safe.mode === "refresh"
      ? safe.mode
      : "deep";
  const workflowMode = ["auto", "potential_clients", "hot_signals", "rank_provided_list"].includes(
    String(safe.workflow_mode || "").trim()
  )
    ? String(safe.workflow_mode || "").trim()
    : "auto";
  const searchTarget = ["buyer_only", "competitor_scan"].includes(
    String(safe.search_target || safe.artem_target || "").trim()
  )
    ? String(safe.search_target || safe.artem_target || "").trim()
    : "buyer_only";
  const geoScope = ["cis", "global"].includes(
    String(safe.geo_scope || safe.artem_geo_scope || "").trim().toLowerCase()
  )
    ? String(safe.geo_scope || safe.artem_geo_scope || "").trim().toLowerCase()
    : "cis";
  const focus = ["wb_ozon", "marketing", "automation", "chatbots", "crm", "mixed"].includes(
    safe.focus
  )
    ? safe.focus
    : "mixed";
  const keywords = normalizeKeywords(safe.keywords);
  const normalized = {
    mode,
    workflow_mode: workflowMode,
    search_target: searchTarget,
    geo_scope: geoScope,
    has_web_access: typeof safe.has_web_access === "boolean" ? safe.has_web_access : true,
    max_web_requests: resolveMaxRequests(mode, safe.max_web_requests),
    focus,
    query_text: resolveUserTaskText(safe),
    geo: typeof safe.geo === "string" && safe.geo.trim() ? safe.geo.trim() : "",
    keywords,
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
      : "mixed",
    raw_text: explicitRawText || normalizeWhitespace(safe.query_text || ""),
    raw_text_provided: Boolean(explicitRawText)
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

const INTENT_RESPONSE_SCHEMA = {
  type: "object",
  required: [
    "offer",
    "icp",
    "constraints",
    "buying_signal_lexicon",
    "negative_lexicon"
  ],
  additionalProperties: true,
  properties: {
    offer: {
      type: "object",
      required: ["product_or_service", "keywords", "synonyms"],
      additionalProperties: true,
      properties: {
        product_or_service: {},
        keywords: { type: "array", items: { type: "string" } },
        synonyms: { type: "array", items: { type: "string" } }
      }
    },
    icp: {
      type: "object",
      required: ["geo", "company_size", "industries", "roles"],
      additionalProperties: true,
      properties: {
        geo: { type: "array", items: { type: "string" } },
        company_size: {},
        industries: { type: "array", items: { type: "string" } },
        roles: { type: "array", items: { type: "string" } }
      }
    },
    constraints: {
      type: "object",
      required: ["language", "must_have", "must_not_have"],
      additionalProperties: true,
      properties: {
        language: { type: "string" },
        must_have: { type: "array", items: { type: "string" } },
        must_not_have: { type: "array", items: { type: "string" } }
      }
    },
    buying_signal_lexicon: {
      type: "object",
      required: ["ru", "en"],
      additionalProperties: true,
      properties: {
        ru: { type: "array", items: { type: "string" } },
        en: { type: "array", items: { type: "string" } }
      }
    },
    negative_lexicon: {
      type: "object",
      required: ["ru", "en"],
      additionalProperties: true,
      properties: {
        ru: { type: "array", items: { type: "string" } },
        en: { type: "array", items: { type: "string" } }
      }
    },
    product_or_service: { type: "array", items: { type: "string" } },
    target_customer: { type: "array", items: { type: "string" } },
    geo: { type: "array", items: { type: "string" } },
    company_size: { type: "array", items: { type: "string" } },
    buying_signals: { type: "array", items: { type: "string" } },
    language: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    synonyms_ru_en: { type: "array", items: { type: "string" } },
    negative_keywords: { type: "array", items: { type: "string" } },
    industries: { type: "array", items: { type: "string" } },
    roles: { type: "array", items: { type: "string" } },
    competitive_terms: { type: "array", items: { type: "string" } },
    domains: { type: "array", items: { type: "string" } }
  }
};

const SEARCH_SCORING_SCHEMA = {
  type: "object",
  required: ["items"],
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "candidate_id",
          "source_type",
          "entity_role",
          "relevance_score",
          "intent_score",
          "lead_type",
          "has_buying_signal",
          "reason",
          "evidence",
          "contact_hint"
        ],
        additionalProperties: true,
        properties: {
          candidate_id: { type: "string" },
          source_type: { type: "string", enum: SOURCE_TYPES },
          entity_role: { type: "string", enum: ENTITY_ROLES },
          relevance_score: { type: "number" },
          intent_score: { type: "number" },
          lead_type: { type: "string", enum: ["Hot", "Warm", "Drop"] },
          has_buying_signal: { type: "boolean" },
          reason: { type: "string" },
          evidence: { type: "string" },
          contact_hint: { type: "string" }
        }
      }
    }
  }
};

const runProviderJsonWithUsage = async (provider, payload) => {
  if (provider && typeof provider.generateJsonWithUsage === "function") {
    const result = await provider.generateJsonWithUsage(payload);
    return {
      data: result?.data && typeof result.data === "object" ? result.data : result || {},
      usage: normalizeUsage(result?.usage)
    };
  }

  if (provider && typeof provider.generateJson === "function") {
    const data = await provider.generateJson(payload);
    return {
      data: data && typeof data === "object" ? data : {},
      usage: normalizeUsage()
    };
  }

  throw new Error("LLM provider is not configured");
};

const normalizeIntentPayload = ({ payload, fallbackIntent, input }) => {
  const safe = payload && typeof payload === "object" ? payload : {};
  const fallback = fallbackIntent && typeof fallbackIntent === "object" ? fallbackIntent : {};
  const offerObj = safe.offer && typeof safe.offer === "object" ? safe.offer : {};
  const icpObj = safe.icp && typeof safe.icp === "object" ? safe.icp : {};
  const constraintsObj = safe.constraints && typeof safe.constraints === "object" ? safe.constraints : {};
  const buyingLexiconObj =
    safe.buying_signal_lexicon && typeof safe.buying_signal_lexicon === "object"
      ? safe.buying_signal_lexicon
      : {};
  const negativeLexiconObj =
    safe.negative_lexicon && typeof safe.negative_lexicon === "object"
      ? safe.negative_lexicon
      : {};
  const taskText = resolveUserTaskText(input);
  const taskLanguage = detectLanguage([taskText, normalizeKeywords(input.keywords).join(" ")].join(" "));
  const languageRaw = normalizePhrase(constraintsObj.language || safe.language, 20).toLowerCase();
  const language =
    languageRaw === "ru" || languageRaw === "en" || languageRaw === "mixed"
      ? languageRaw
      : languageRaw === "auto"
        ? taskLanguage
        : taskLanguage;

  const domains = toStringList(
    [
      ...(Array.isArray(safe.domains) ? safe.domains : []),
      ...(Array.isArray(fallback.domains) ? fallback.domains : []),
      ...extractDomainsFromText(taskText),
      ...normalizeKeywords(input.keywords).filter((item) => item.includes("."))
    ],
    10,
    120
  ).map((item) => item.toLowerCase());

  const offerKeywords = toStringList(
    [
      ...asArray(offerObj.keywords),
      ...asArray(safe.keywords),
      ...(Array.isArray(fallback.primary_terms) ? fallback.primary_terms : []),
      ...normalizeKeywords(input.keywords)
    ],
    24,
    120
  );

  const product = toStringList(
    [
      ...asArray(offerObj.product_or_service),
      ...(Array.isArray(safe.product_or_service) ? safe.product_or_service : []),
      ...(Array.isArray(fallback.product_or_service) ? fallback.product_or_service : []),
      ...offerKeywords.slice(0, 8)
    ],
    14,
    120
  );

  const synonyms = toStringList(
    [
      ...asArray(offerObj.synonyms),
      ...(Array.isArray(safe.synonyms_ru_en) ? safe.synonyms_ru_en : [])
    ],
    24,
    90
  );

  const geo = toStringList(
    [
      ...asArray(icpObj.geo),
      ...(Array.isArray(safe.geo) ? safe.geo : []),
      ...(Array.isArray(fallback.geo) ? fallback.geo : []),
      input.geo
    ],
    6,
    80
  );

  const companySize = toStringList(
    [
      ...asArray(icpObj.company_size),
      ...(Array.isArray(safe.company_size) ? safe.company_size : []),
      ...(Array.isArray(fallback.constraints) ? fallback.constraints : [])
    ],
    8,
    80
  );

  const industries = toStringList(
    [
      ...asArray(icpObj.industries),
      ...(Array.isArray(safe.industries) ? safe.industries : []),
      ...extractPhrasesByMarkers(taskText, ["в нише", "отрасль", "сегмент", "industry", "vertical"])
    ],
    14,
    80
  );

  const roles = toStringList(
    [
      ...asArray(icpObj.roles),
      ...(Array.isArray(safe.target_customer) ? safe.target_customer : []),
      ...(Array.isArray(fallback.icp) ? fallback.icp : [])
    ],
    14,
    90
  );

  const constraintsMustHave = toStringList(
    [
      ...asArray(constraintsObj.must_have),
      ...(Array.isArray(safe.constraints) ? safe.constraints : []),
      ...(Array.isArray(fallback.constraints) ? fallback.constraints : [])
    ],
    12,
    90
  );

  const constraintsMustNotHave = toStringList(
    [
      ...asArray(constraintsObj.must_not_have),
      ...asArray(safe.must_not_have)
    ],
    12,
    80
  );

  const buyingSignalsRu = toStringList(
    [
      ...BASE_BUYING_SIGNAL_LEXICON.ru,
      ...asArray(buyingLexiconObj.ru)
    ],
    40,
    80
  );

  const buyingSignalsEn = toStringList(
    [
      ...BASE_BUYING_SIGNAL_LEXICON.en,
      ...asArray(buyingLexiconObj.en)
    ],
    40,
    80
  );

  const negativeLexRu = toStringList(
    [
      ...BASE_NEGATIVE_LEXICON.ru,
      ...asArray(negativeLexiconObj.ru),
      ...asArray(safe.negative_keywords).filter((item) => /[А-Яа-яЁё]/.test(String(item)))
    ],
    40,
    80
  );

  const negativeLexEn = toStringList(
    [
      ...BASE_NEGATIVE_LEXICON.en,
      ...asArray(negativeLexiconObj.en),
      ...asArray(safe.negative_keywords).filter((item) => /[A-Za-z]/.test(String(item)))
    ],
    40,
    80
  );

  const competitiveTerms = toStringList(
    Array.isArray(safe.competitive_terms) ? safe.competitive_terms : [],
    12,
    90
  );

  const buyingSignals = toStringList(
    [
      ...(Array.isArray(safe.buying_signals) ? safe.buying_signals : []),
      ...asArray(fallback.hot_signals),
      ...(language === "en"
        ? buyingSignalsEn
        : language === "ru"
          ? buyingSignalsRu
          : [...buyingSignalsRu.slice(0, 12), ...buyingSignalsEn.slice(0, 12)])
    ],
    24,
    90
  );

  const keywords = toStringList(
    [...offerKeywords, ...product, ...asArray(fallback.primary_terms)],
    26,
    90
  );
  const termTokens = new Set([
    ...tokenizeTerms(taskText),
    ...keywords.flatMap((item) => tokenizeTerms(item)),
    ...product.flatMap((item) => tokenizeTerms(item)),
    ...roles.flatMap((item) => tokenizeTerms(item)),
    ...industries.flatMap((item) => tokenizeTerms(item)),
    ...domains.flatMap((item) => tokenizeTerms(item)),
    ...buyingSignals.flatMap((item) => tokenizeTerms(item))
  ]);

  const assumptionsApplied = [];
  const geoScopeInference = inferGeoScopeFromText({
    inputGeoScope: input.geo_scope,
    language,
    taskText,
    geoCandidates: [...geo, input.geo, ...asArray(icpObj.geo), ...asArray(safe.geo)]
  });
  const resolvedGeoScope = geoScopeInference.geo_scope;
  const resolvedGeo = [...geo];
  if (resolvedGeo.length === 0) {
    if (Array.isArray(geoScopeInference.geo_terms) && geoScopeInference.geo_terms.length > 0) {
      resolvedGeo.push(...geoScopeInference.geo_terms.slice(0, 12));
    } else if (resolvedGeoScope === "global") {
      resolvedGeo.push("Global");
    } else {
      resolvedGeo.push(...CIS_COUNTRIES_RU);
    }
  }
  assumptionsApplied.push(
    ...(Array.isArray(geoScopeInference.assumptions) ? geoScopeInference.assumptions : [])
  );

  const resolvedCompanySize = [...companySize];
  if (resolvedCompanySize.length === 0) {
    resolvedCompanySize.push("SMB", "midmarket");
    assumptionsApplied.push("company_size_defaulted_to_smb_midmarket");
  }

  const resolvedIndustries = [...industries];
  if (resolvedIndustries.length === 0) {
    resolvedIndustries.push(...(language === "ru" ? DEFAULT_INDUSTRIES_RU : DEFAULT_INDUSTRIES_EN));
    assumptionsApplied.push("industries_defaulted_top10");
  }

  const resolvedRoles = [...roles];
  if (resolvedRoles.length === 0) {
    resolvedRoles.push(...(language === "ru" ? DEFAULT_ROLES_RU : DEFAULT_ROLES_EN));
    assumptionsApplied.push("roles_defaulted_common_buyer_roles");
  }

  const resolvedTargetCustomer = toStringList(
    [...resolvedRoles, ...resolvedIndustries],
    16,
    90
  );
  if (resolvedTargetCustomer.length === 0) {
    resolvedTargetCustomer.push(language === "en" ? "business teams" : "компании и команды");
    assumptionsApplied.push("icp_defaulted_generic_business");
  }

  const resolvedBuyingSignals = [...buyingSignals];
  if (resolvedBuyingSignals.length === 0) {
    if (language === "en") {
      resolvedBuyingSignals.push(
        "looking for",
        "need",
        "selecting",
        "implementing",
        "tender",
        "procurement",
        "hiring"
      );
    } else {
      resolvedBuyingSignals.push(
        "ищем",
        "нужно",
        "выбираем",
        "внедряем",
        "тендер",
        "закупка",
        "вакансия"
      );
    }
    assumptionsApplied.push("buying_signals_defaulted");
  }

  const resolvedProduct = [...product];
  if (resolvedProduct.length === 0 && keywords.length > 0) {
    resolvedProduct.push(...keywords.slice(0, 6));
    assumptionsApplied.push("product_terms_defaulted_from_keywords");
  }

  const primaryTerms = toStringList(
    [
      ...resolvedProduct,
      ...resolvedTargetCustomer,
      ...constraintsMustHave,
      ...keywords,
      ...synonyms,
      ...resolvedIndustries,
      ...resolvedRoles
    ],
    28,
    90
  );
  const termTokenList = [
    ...new Set([
      ...termTokens,
      ...resolvedGeo.flatMap((item) => tokenizeTerms(item)),
      ...resolvedCompanySize.flatMap((item) => tokenizeTerms(item)),
      ...resolvedTargetCustomer.flatMap((item) => tokenizeTerms(item)),
      ...resolvedBuyingSignals.flatMap((item) => tokenizeTerms(item)),
      ...resolvedIndustries.flatMap((item) => tokenizeTerms(item)),
      ...resolvedRoles.flatMap((item) => tokenizeTerms(item))
    ])
  ];

  const normalizedConstraintsLanguage = language === "mixed" ? "auto" : language;
  const negativeKeywords = toStringList(
    [...negativeLexRu, ...negativeLexEn, ...asArray(safe.negative_keywords)],
    50,
    80
  );

  return {
    task_text: taskText,
    offer: {
      product_or_service: resolvedProduct[0] || "",
      keywords,
      synonyms
    },
    icp: {
      geo: resolvedGeo,
      company_size: resolvedCompanySize[0] || "",
      industries: resolvedIndustries,
      roles: resolvedRoles,
      geo_scope: resolvedGeoScope
    },
    constraints: {
      language: normalizedConstraintsLanguage || "auto",
      must_have: constraintsMustHave,
      must_not_have: constraintsMustNotHave
    },
    buying_signal_lexicon: {
      ru: buyingSignalsRu,
      en: buyingSignalsEn
    },
    negative_lexicon: {
      ru: negativeLexRu,
      en: negativeLexEn
    },
    product_or_service: resolvedProduct,
    target_customer: resolvedTargetCustomer,
    geo: resolvedGeo,
    geo_scope: resolvedGeoScope,
    company_size: resolvedCompanySize,
    buying_signals: resolvedBuyingSignals,
    language,
    keywords,
    synonyms_ru_en: synonyms,
    negative_keywords: negativeKeywords,
    industries: resolvedIndustries,
    roles: resolvedRoles,
    constraints: constraintsMustHave,
    must_not_have: constraintsMustNotHave,
    competitive_terms: competitiveTerms,
    domains,
    primary_terms: primaryTerms,
    term_tokens: termTokenList,
    assumptions_applied: assumptionsApplied,
    llm_raw: safe
  };
};

const buildIntentPrompt = (input) => {
  const taskText = resolveUserTaskText(input);
  const keywordContext = normalizeKeywords(input.keywords);
  const geoHint = normalizePhrase(input.geo, 80);

  return [
    "PARSE_INTENT",
    "Извлеки структуру intent из пользовательской задачи для универсального lead finder.",
    "Запрещено использовать пользовательский текст целиком как query.",
    "Запрещено придумывать несуществующие компании/контакты.",
    "Если geo явно не указан и язык запроса ru — подразумевай geo_scope=CIS.",
    "Извлекай только сущности из текста пользователя, домена, гео, размера и ограничений.",
    "",
    `user_text: ${taskText || "-"}`,
    `input_keywords: ${keywordContext.join(", ") || "-"}`,
    `input_geo: ${geoHint || "-"}`,
    "",
    "Верни JSON СТРОГО в форме:",
    '{ "offer": {"product_or_service":"", "keywords":[], "synonyms":[]},',
    '  "icp": {"geo":[], "company_size":"", "industries":[], "roles":[]},',
    '  "constraints": {"language":"ru|en|auto", "must_have":[], "must_not_have":[]},',
    '  "buying_signal_lexicon": {"ru":[], "en":[]},',
    '  "negative_lexicon": {"ru":[], "en":[]} }',
    "",
    "Правила:",
    "- offer.keywords: только смысловые слова продукта/услуги, без мусора вроде 'найди лидов'.",
    "- buying_signal_lexicon: базовый словарь обязательно должен быть включен (можно расширять).",
    "- negative_lexicon: базовый словарь обязательно должен быть включен (можно расширять).",
    "- если язык неочевиден: language=auto."
  ].join("\n");
};

const parseIntentWithLLM = async ({ input, provider }) => {
  const fallbackIntent = extractIntentHeuristic(input);
  const modelUsed = String(process.env.OPENAI_MODEL || "gpt-5-mini").trim() || "gpt-5-mini";
  const call = {
    step: "PARSE_INTENT",
    provider: provider?.name || "unknown",
    model: modelUsed,
    fetched_at: new Date().toISOString(),
    duration_ms: 0,
    status: "OK",
    error: "",
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };

  const started = Date.now();
  try {
    const response = await runWithTimeout(
      runProviderJsonWithUsage(provider, {
        system:
          "Ты извлекаешь intent для лидогенерации. Возвращай только JSON строго по схеме. Не добавляй дефолтные поисковые запросы и случайные темы. Включай базовые buying/negative lexicon.",
        prompt: buildIntentPrompt(input),
        schema: INTENT_RESPONSE_SCHEMA,
        temperature: 0.1,
        maxTokens: 1200,
        meta: {
          agent_id: artemAgent.id,
          step: "PARSE_INTENT",
          model: modelUsed
        }
      }),
      input.mode === "quick" ? 12000 : 20000,
      "PARSE_INTENT_TIMEOUT"
    );
    const usage = normalizeUsage(response.usage);
    call.duration_ms = Date.now() - started;
    call.prompt_tokens = usage.prompt_tokens;
    call.completion_tokens = usage.completion_tokens;
    call.total_tokens = usage.total_tokens;
    const normalized = normalizeIntentPayload({
      payload: response.data,
      fallbackIntent,
      input
    });
    return { intent: normalized, usage, call };
  } catch (error) {
    call.duration_ms = Date.now() - started;
    call.status = "ERROR";
    call.error = error instanceof Error ? error.message : "INTENT_PARSER_FAILED";
    const usage = normalizeUsage();
    return {
      intent: normalizeIntentPayload({
        payload: {},
        fallbackIntent,
        input
      }),
      usage,
      call,
      warning: "INTENT_PARSER_FAILED"
    };
  }
};

const hasSignalMatching = (intent, regex) => {
  const haystack = [
    ...(Array.isArray(intent.buying_signals) ? intent.buying_signals : []),
    ...(Array.isArray(intent.keywords) ? intent.keywords : []),
    ...(Array.isArray(intent.primary_terms) ? intent.primary_terms : []),
    String(intent.task_text || "")
  ]
    .join(" ")
    .toLowerCase();
  return regex.test(haystack);
};

const buildSearchPlan = (input, intent) => {
  const queries = [];
  const seen = new Set();
  const maxQueries = input.mode === "quick" ? MAX_QUERY_COUNT_QUICK : MAX_QUERY_COUNT_DEEP;
  const minQueries = Math.min(MIN_QUERY_COUNT, maxQueries);
  const searchTarget = input.search_target === "competitor_scan" ? "competitor_scan" : "buyer_only";
  const language = String(intent.language || detectLanguage(intent.task_text || "")).toLowerCase() || "mixed";
  const geoScopeRaw = String(intent.geo_scope || input.geo_scope || "cis").toLowerCase();
  const geoScope =
    geoScopeRaw === "global" ? "global" : geoScopeRaw === "custom" ? "custom" : "cis";
  const offerObj = intent.offer && typeof intent.offer === "object" ? intent.offer : {};
  const icpObj = intent.icp && typeof intent.icp === "object" ? intent.icp : {};
  const lexiconObj =
    intent.buying_signal_lexicon && typeof intent.buying_signal_lexicon === "object"
      ? intent.buying_signal_lexicon
      : {};

  const productTerms = toStringList(
    [
      ...asArray(offerObj.product_or_service),
      ...asArray(offerObj.keywords),
      ...(Array.isArray(intent.product_or_service) ? intent.product_or_service : []),
      ...(Array.isArray(intent.keywords) ? intent.keywords : [])
    ],
    18,
    100
  );
  const synonymTerms = toStringList(
    [
      ...asArray(offerObj.synonyms),
      ...(Array.isArray(intent.synonyms_ru_en) ? intent.synonyms_ru_en : [])
    ],
    18,
    90
  );
  const geoTerms = toStringList(
    [...asArray(icpObj.geo), ...(Array.isArray(intent.geo) ? intent.geo : [])],
    8,
    80
  );
  const geoProfile = buildGeoProfile({
    geoScope,
    geoTerms,
    language
  });
  const effectiveGeoTerms = toStringList(
    [...geoTerms, ...(Array.isArray(geoProfile.terms) ? geoProfile.terms : [])],
    10,
    80
  );
  const sizeTerms = toStringList(
    [...asArray(icpObj.company_size), ...(Array.isArray(intent.company_size) ? intent.company_size : [])],
    8,
    80
  );
  const industries = toStringList(
    [...asArray(icpObj.industries), ...(Array.isArray(intent.industries) ? intent.industries : [])],
    14,
    80
  );
  const roles = toStringList(
    [...asArray(icpObj.roles), ...(Array.isArray(intent.roles) ? intent.roles : []), ...(Array.isArray(intent.target_customer) ? intent.target_customer : [])],
    14,
    80
  );
  const competitorTerms = toStringList(intent.competitive_terms || [], 12, 90);
  const domains = toStringList(intent.domains || [], 8, 120);
  const rawBuyingSignalLexicon = toStringList(
    language === "en"
      ? [...asArray(lexiconObj.en), ...BASE_BUYING_SIGNAL_LEXICON.en]
      : language === "ru"
        ? [...asArray(lexiconObj.ru), ...BASE_BUYING_SIGNAL_LEXICON.ru]
        : [...asArray(lexiconObj.ru), ...asArray(lexiconObj.en), ...BASE_BUYING_SIGNAL_LEXICON.ru, ...BASE_BUYING_SIGNAL_LEXICON.en],
    28,
    80
  );

  const resolvedIndustries =
    industries.length > 0 ? industries : language === "ru" ? DEFAULT_INDUSTRIES_RU : DEFAULT_INDUSTRIES_EN;
  const resolvedRoles =
    roles.length > 0 ? roles : language === "ru" ? DEFAULT_ROLES_RU : DEFAULT_ROLES_EN;
  const coreTerms = toStringList([...productTerms, ...synonymTerms], 18, 90);
  const signalTerms = toStringList(
    [
      ...BUYER_SIGNAL_MARKERS,
      ...(searchTarget === "buyer_only"
        ? [
            "ищем подрядчика",
            "ищем поставщика",
            "выбираем платформу",
            "собираем кп",
            "тендер",
            "закупка",
            "rfp",
            "looking for supplier",
            "need contractor"
          ]
        : []),
      ...rawBuyingSignalLexicon
    ].filter(
      (token) =>
        !VENDOR_SIGNAL_MARKERS.some((vendorMarker) =>
          String(token || "").toLowerCase().includes(String(vendorMarker || "").toLowerCase())
        )
    ),
    28,
    80
  );
  const solutionTerms =
    language === "en"
      ? ["platform", "service", "solution", "software", "automation"]
      : ["платформа", "сервис", "решение", "система", "автоматизация"];
  const priceTerms =
    language === "en"
      ? ["pricing", "cost", "demo", "integration"]
      : ["цена", "стоимость", "тариф", "демо", "интеграция"];
  const buyerOnlyCoreSignals =
    language === "en"
      ? [
          "looking for supplier",
          "need contractor",
          "selecting platform",
          "procurement",
          "request for proposal"
        ]
      : [
          "ищем подрядчика",
          "ищем поставщика",
          "выбираем платформу",
          "собираем кп",
          "тендер",
          "закупка",
          "коммерческое предложение"
        ];
  const socialPhrases =
    language === "en"
      ? ["looking for", "need", "recommend", "selecting", "need a vendor"]
      : ["посоветуйте сервис", "ищем", "нужно", "выбираем", "подбираем"];

  const icpQualifiers = toStringList(
    [...resolvedIndustries, ...resolvedRoles, ...effectiveGeoTerms, ...sizeTerms],
    28,
    90
  );

  const pushQuery = (value) => {
    let safe = normalizePhrase(value, 220);
    if (!safe) return;
    if (
      searchTarget === "buyer_only" &&
      geoScope !== "global" &&
      geoProfile.query_clause &&
      !hasAnyMarker(safe, geoProfile.markers)
    ) {
      safe = normalizePhrase(`${safe} ${geoProfile.query_clause}`, 220);
    }
    if (safe.toLowerCase() === normalizePhrase(intent.task_text, 200).toLowerCase()) return;
    const key = safe.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    queries.push(safe);
  };

  // A) Hot signals templates
  signalTerms.slice(0, 18).forEach((signal) => {
    coreTerms.slice(0, 12).forEach((term) => {
      pushQuery(`${signal} ${term}`);
      solutionTerms.slice(0, 3).forEach((solution) => {
        pushQuery(`${signal} ${term} ${solution}`);
      });
      if (searchTarget === "competitor_scan") {
        priceTerms.slice(0, 3).forEach((suffix) => {
          pushQuery(`${term} ${signal} ${suffix}`);
        });
      }
      geoTerms.slice(0, 3).forEach((geo) => {
        pushQuery(`${signal} ${term} ${geo}`);
      });
    });
  });

  if (searchTarget === "buyer_only") {
    coreTerms.slice(0, 12).forEach((term) => {
      buyerOnlyCoreSignals.slice(0, 7).forEach((signal) => {
        pushQuery(`${signal} ${term}`);
      });
    });
  }

  // B) Jobs templates
  coreTerms.slice(0, 10).forEach((term) => {
    if (language === "en") {
      pushQuery(`site:linkedin.com/jobs (${term}) (implementation OR platform OR automation)`);
      pushQuery(`site:indeed.com (${term}) (implementation OR solution)`);
    } else {
      pushQuery(`site:hh.ru (${term}) (внедрение OR платформа OR система OR автоматизация)`);
      pushQuery(`site:superjob.ru (${term}) (внедрение OR сервис)`);
      pushQuery(`site:trudvsem.ru (${term}) (внедрение OR автоматизация)`);
    }
  });

  // Mandatory buyer-signal queries by source
  if (searchTarget === "buyer_only") {
    coreTerms.slice(0, 12).forEach((term) => {
      if (language === "ru") {
        pushQuery(`site:hh.ru "${term}" ("ищем" OR "нужно" OR "выбираем" OR "внедряем")`);
        pushQuery(`site:superjob.ru "${term}" ("ищем" OR "нужно" OR "внедряем")`);
        pushQuery(`site:zakupki.gov.ru "${term}" (тендер OR закупка OR "коммерческое предложение" OR кп)`);
        pushQuery(`site:b2b-center.ru "${term}" (тендер OR закупка)`);
        pushQuery(`site:vk.com/wall "${term}" ("посоветуйте сервис" OR "ищем" OR "нужно" OR "выбираем")`);
        pushQuery(`site:t.me/s "${term}" ("посоветуйте сервис" OR "ищем" OR "нужно")`);
      } else {
        pushQuery(`site:linkedin.com/jobs "${term}" ("looking for" OR "need" OR "implement")`);
        pushQuery(`site:indeed.com "${term}" ("looking for" OR "need")`);
        pushQuery(`"${term}" ("tender" OR "procurement" OR "rfp" OR "request for proposal")`);
      }
    });
  }

  // C) Tenders/RFP templates
  coreTerms.slice(0, 10).forEach((term) => {
    if (language === "en") {
      pushQuery(`(tender OR procurement OR rfp OR "request for proposal") ${term}`);
    } else {
      pushQuery(`(тендер OR закупка OR конкурс OR кп OR "коммерческое предложение") ${term}`);
      pushQuery(`site:zakupki.gov.ru ${term}`);
      pushQuery(`site:b2b-center.ru ${term}`);
      pushQuery(`site:rostender.info ${term}`);
    }
  });

  // D) Community posts templates
  coreTerms.slice(0, 10).forEach((term) => {
    socialPhrases.slice(0, 4).forEach((phrase) => {
      if (language === "en") {
        pushQuery(`${phrase} ${term} ${solutionTerms[0]}`);
      } else {
        pushQuery(`${phrase} ${term} ${solutionTerms[0]}`);
      }
    });
    if (language === "ru") {
      pushQuery(`site:vk.com/wall (${term}) ("ищем" OR "нужно" OR "посоветуйте")`);
      pushQuery(`site:t.me/s (${term}) ("ищем" OR "нужно" OR "выбираем")`);
      pushQuery(`site:vc.ru ${term} внедрение`);
    } else {
      pushQuery(`site:linkedin.com/posts (${term}) ("looking for" OR "need")`);
      pushQuery(`site:x.com (${term}) ("looking for" OR "need")`);
    }
  });

  if (searchTarget === "competitor_scan") {
    // E) Competitive landscape discovery (optional mode)
    resolvedIndustries.slice(0, 10).forEach((industry) => {
      resolvedRoles.slice(0, 6).forEach((role) => {
        coreTerms.slice(0, 6).forEach((term) => {
          pushQuery(`${industry} ${role} ${term}`);
          if (geoTerms.length > 0) {
            pushQuery(`${industry} ${role} ${term} ${geoTerms[0]}`);
          }
        });
      });
    });

    coreTerms.slice(0, 10).forEach((term) => {
      if (language === "en") {
        pushQuery(`companies using ${term}`);
        pushQuery(`${term} vendor ${geoTerms[0] || ""}`.trim());
      } else {
        pushQuery(`компании внедрение ${term}`);
        pushQuery(`${term} подрядчик ${geoTerms[0] || ""}`.trim());
        pushQuery(`${term} платформа для бизнеса`);
      }
    });
  }

  domains.forEach((domain) => {
    coreTerms.slice(0, 8).forEach((term) => {
      pushQuery(`${domain} ${term}`);
      pushQuery(`"${domain}" "${term}"`);
    });
    icpQualifiers.slice(0, 6).forEach((qualifier) => {
      pushQuery(`${domain} ${qualifier}`);
    });
  });

  const hasVacancyIntent = hasSignalMatching(intent, /(вакан|hiring|нанима|hr|people ops|подбор)/i);
  const hasTenderIntent = hasSignalMatching(intent, /(тендер|закупк|rfp|коммерческое предложение|кп)/i);
  const hasAlternativeIntent = hasSignalMatching(intent, /(альтернати|замен|конкурент|сравнен)/i);
  const hasTelegramFocus = hasSignalMatching(intent, /(telegram|телеграм|t\.me)/i);
  const hasVkFocus = hasSignalMatching(intent, /(vk|вк|vk\.com)/i);
  const hasCommunityIntent = hasSignalMatching(intent, /(сообщество|пост|канал|форум|community|post|channel)/i);

  if (hasVacancyIntent) {
    coreTerms.slice(0, 10).forEach((term) => {
      if (language === "en") {
        pushQuery(`hiring ${term} implementation platform`);
        pushQuery(`site:linkedin.com/jobs ${term} implementation`);
      } else {
        pushQuery(`вакансия ${term} внедрение платформа`);
        pushQuery(`site:hh.ru ${term} внедрение платформа`);
      }
    });
  }

  if (hasTenderIntent) {
    coreTerms.slice(0, 10).forEach((term) => {
      if (language === "en") {
        pushQuery(`tender procurement ${term}`);
        pushQuery(`request for proposal ${term}`);
      } else {
        pushQuery(`тендер ${term} закупка`);
        pushQuery(`site:zakupki.gov.ru ${term} закупка`);
        pushQuery(`site:b2b-center.ru ${term} закупка`);
      }
    });
  }

  if (searchTarget === "competitor_scan" && (hasAlternativeIntent || competitorTerms.length > 0)) {
    competitorTerms.slice(0, 10).forEach((term) => {
      pushQuery(`${term} альтернатива`);
      pushQuery(`${term} замена платформа`);
      pushQuery(`${term} сравнение решений`);
    });
  }

  if (hasTelegramFocus) {
    coreTerms.slice(0, 8).forEach((term) => {
      pushQuery(`site:t.me/s ${term}`);
    });
  }

  if (hasVkFocus || hasCommunityIntent || searchTarget === "buyer_only") {
    coreTerms.slice(0, 8).forEach((term) => {
      pushQuery(`site:vk.com/wall ${term}`);
    });
    if (searchTarget === "competitor_scan") {
      coreTerms.slice(0, 8).forEach((term) => {
        pushQuery(`site:vc.ru ${term}`);
      });
    }
  }

  if (language === "ru") {
    effectiveGeoTerms.slice(0, 4).forEach((geo) => {
      coreTerms.slice(0, 8).forEach((term) => {
        pushQuery(`${term} ${geo} .ru`);
      });
    });
  } else if (language === "en") {
    effectiveGeoTerms.slice(0, 4).forEach((geo) => {
      coreTerms.slice(0, 8).forEach((term) => {
        pushQuery(`${term} ${geo} site:.com`);
      });
    });
  }

  if (queries.length < minQueries) {
    coreTerms.slice(0, 10).forEach((term, index) => {
      if (queries.length >= minQueries) return;
      const industry = resolvedIndustries[index % resolvedIndustries.length] || "";
      const role = resolvedRoles[index % resolvedRoles.length] || "";
      if ((industry || role) && searchTarget === "competitor_scan") {
        pushQuery(`${term} ${industry} ${role}`.trim());
      }
      const signal = signalTerms[index % signalTerms.length] || "";
      if (signal) {
        pushQuery(`${signal} ${term} ${industry}`.trim());
        if (language === "ru") {
          pushQuery(`"${signal}" "${term}" тендер`);
        } else {
          pushQuery(`"${signal}" "${term}" tender`);
        }
      }
      const qualifier = icpQualifiers[index % icpQualifiers.length] || "";
      if (qualifier && searchTarget === "competitor_scan") {
        pushQuery(`${term} ${qualifier}`);
      }
    });
  }

  if (queries.length < minQueries && searchTarget === "competitor_scan") {
    icpQualifiers.slice(0, 16).forEach((qualifier, index) => {
      if (queries.length >= minQueries) return;
      const term = coreTerms[index % Math.max(1, coreTerms.length)] || qualifier;
      pushQuery(`${qualifier} ${term}`);
    });
  }

  return {
    intent: {
      ...intent,
      geo_scope: geoScope,
      geo_profile: {
        geo_scope: geoProfile.geo_scope,
        terms: effectiveGeoTerms
      }
    },
    queries: queries.slice(0, maxQueries)
  };
};

const getSourceType = (url) => {
  const lower = url.toLowerCase();
  if (lower.includes("vk.com")) return "vk";
  if (lower.includes("t.me")) return "telegram";
  if (lower.includes("yandex.ru/maps")) return "maps_yandex";
  if (lower.includes("2gis")) return "maps_2gis";
  return "other";
};

const isUrlAllowedByQuerySource = (url, query) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const queryLower = String(query || "").toLowerCase();

    if (queryLower.includes("site:vk.com")) {
      return host === "vk.com" || host.endsWith(".vk.com");
    }
    if (queryLower.includes("site:t.me")) {
      return host === "t.me" || host.endsWith(".t.me") || host === "telegram.me";
    }
    if (queryLower.includes("site:yandex.ru/maps")) {
      return host === "yandex.ru" || host.endsWith(".yandex.ru");
    }
    if (queryLower.includes("site:2gis.ru")) {
      return host === "2gis.ru" || host.endsWith(".2gis.ru");
    }

    return true;
  } catch {
    return false;
  }
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
  if (
    /(кто сделает|ищем подрядчика|нужен подрядчик|нужен исполнитель|тендер|закупк|rfp|ваканси|ищем|выбираем|купить)/i.test(
      source
    )
  ) {
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

const hasExplicitHotIntent = (text, intentClass) => {
  if (intentClass === "need_vendor" || intentClass === "complaint_trigger") return true;
  const source = String(text || "");
  if (
    /(заявк|форма|контакт|telegram|телеграм|whatsapp|ватсап|email|почт|напишите|в лс|позвон|оставьте номер|тендер|закупк|ваканси|выбираем|купить)/i.test(
      source
    )
  ) {
    return true;
  }
  if (intentClass === "price_check" && /(услуг|подрядчик|исполнител|внедрен|настро)/i.test(source)) {
    return true;
  }
  if (intentClass === "need_advice" && /(кто сделает|нужен подрядчик|ищем подрядчика)/i.test(source)) {
    return true;
  }
  return false;
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

const getDomainForDedupe = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const normalizeTitleForDedupe = (title) =>
  String(title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

const buildCompositeLeadKey = ({ url, title, fallbackText, input }) => {
  const canonical = url ? canonicalizeUrl(url) : "";
  const titleKey = normalizeTitleForDedupe(title || "");
  if (canonical || titleKey) {
    return `lead:${canonical}|${titleKey}`;
  }
  return buildDedupeKey(url, fallbackText || "", input);
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

const containsNoiseMarker = (text) => {
  const lower = String(text || "").toLowerCase();
  return RELEVANCE_NOISE_MARKERS.some((marker) => lower.includes(marker));
};

const detectNoiseTokensFromText = (text) => {
  const lower = String(text || "").toLowerCase();
  return NOISE_TOKEN_HINTS.filter((token) => lower.includes(token));
};

const buildIntentTokenSet = (intent) =>
  new Set(
    [
      ...(Array.isArray(intent.term_tokens) ? intent.term_tokens : []),
      ...(Array.isArray(intent.domains) ? intent.domains.flatMap((item) => tokenizeTerms(item)) : []),
      ...(Array.isArray(intent.primary_terms) ? intent.primary_terms.flatMap((item) => tokenizeTerms(item)) : [])
    ].filter(Boolean)
  );

const hasExplicitIntentSignal = (text) => {
  const lower = String(text || "").toLowerCase();
  return HOT_SIGNAL_MARKERS.some((marker) => lower.includes(marker));
};

const hasVendorSignal = (text) => {
  const lower = String(text || "").toLowerCase();
  return VENDOR_SIGNAL_MARKERS.some((marker) => lower.includes(marker));
};

const normalizeEntityRole = (value) => {
  const safe = normalizePhrase(value, 30).toLowerCase();
  if (ENTITY_ROLES.includes(safe)) return safe;
  return "other";
};

const classifyEntityRole = ({ title, snippet, url, pageText, sourceType }) => {
  const combined = `${title || ""}\n${snippet || ""}\n${url || ""}\n${String(pageText || "").slice(0, 2000)}`;
  const lower = combined.toLowerCase();
  const source = normalizePhrase(sourceType, 40).toLowerCase();

  if (source === "dictionary" || source === "forum/qna") return "other";
  if (source === "directory") return "directory";
  if (source === "blog/article") return "media";

  const buyerSignals = hasExplicitIntentSignal(lower);
  const vendorSignals = hasVendorSignal(lower);
  const hasBuyerPattern =
    /(ищем|нужно|выбираем|внедряем|тендер|закупк|кп|коммерческое предложение|rfp|looking for|need|selecting|procurement|request for proposal|ваканси|hiring|ищем подрядчика|ищем поставщика|посоветуйте)/i.test(
      lower
    );
  const hasVendorPattern =
    /(мы предлагаем|наш сервис|наша платформа|продукт|product|pricing|цены|тарифы|демо|request demo|book a demo|возможности|интеграции|кейсы клиентов)/i.test(
      lower
    );

  if (source === "tender" || source === "job" || source === "social_post") {
    if (hasVendorPattern && !hasBuyerPattern) return "vendor";
    return "buyer";
  }

  if (buyerSignals || hasBuyerPattern) {
    if (vendorSignals && !hasBuyerPattern) return "vendor";
    return "buyer";
  }

  if (vendorSignals || hasVendorPattern) return "vendor";
  return "other";
};

const hasContactSignal = (text) => {
  const lower = String(text || "").toLowerCase();
  return CONTACT_SIGNAL_MARKERS.some((marker) => lower.includes(marker));
};

const containsNegativeKeyword = (text, negativeKeywords) => {
  const lower = String(text || "").toLowerCase();
  return Array.from(negativeKeywords || []).some((keyword) => lower.includes(keyword));
};

const computeRelevance = ({ title, snippet, url, pageText, intent, negativeKeywords = new Set() }) => {
  const titleText = String(title || "");
  const snippetText = String(snippet || "");
  const pageSnippet = String(pageText || "").slice(0, 2200);
  const combined = `${titleText}\n${snippetText}\n${url}\n${pageSnippet}`;
  const combinedLower = combined.toLowerCase();

  const intentTokens = buildIntentTokenSet(intent);
  const resultTokens = new Set(tokenizeTerms(combinedLower));
  const overlapCount = [...intentTokens].filter((token) => resultTokens.has(token)).length;
  const overlapRatio = intentTokens.size > 0 ? overlapCount / intentTokens.size : 0;

  let score = Math.round(overlapRatio * 60);
  const reasons = [];

  if (overlapCount > 0) {
    reasons.push(`Совпадение по ключам запроса: ${overlapCount}`);
  }

  if (Array.isArray(intent.domains) && intent.domains.some((domain) => combinedLower.includes(domain))) {
    score += 24;
    reasons.push("Есть совпадение по домену/бренду.");
  }

  const primaryHits = Array.isArray(intent.primary_terms)
    ? intent.primary_terms.filter((term) => combinedLower.includes(String(term).toLowerCase())).length
    : 0;
  if (primaryHits > 0) {
    score += Math.min(24, primaryHits * 8);
    reasons.push(`Совпадения по смысловым фразам: ${primaryHits}`);
  }

  const geoHits = Array.isArray(intent.geo)
    ? intent.geo.filter((term) => combinedLower.includes(String(term).toLowerCase())).length
    : 0;
  if (geoHits > 0) {
    score += Math.min(10, geoHits * 5);
    reasons.push("Совпадение по гео.");
  }

  if (hasContactSignal(combinedLower)) {
    score += 10;
    reasons.push("Есть контактный/конверсионный сигнал.");
  }

  if (hasExplicitIntentSignal(combinedLower)) {
    score += 12;
    reasons.push("Есть явный сигнал намерения.");
  }

  if (containsNoiseMarker(combinedLower)) {
    score -= 45;
    reasons.push("Обнаружен шум (не по теме запроса).");
  }

  if (containsNegativeKeyword(combinedLower, negativeKeywords)) {
    score -= 20;
    reasons.push("Совпадение с негативными ключами.");
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));
  return {
    confidence,
    reasons,
    isRelevant: confidence >= RELEVANCE_THRESHOLD,
    hasIntent: hasExplicitIntentSignal(combinedLower)
  };
};

const computeIntentScore = ({ title, snippet, url, pageText, intent }) => {
  const combined = `${title || ""}\n${snippet || ""}\n${url || ""}\n${String(pageText || "").slice(0, 2000)}`.toLowerCase();
  const lexiconRu =
    intent?.buying_signal_lexicon && typeof intent.buying_signal_lexicon === "object"
      ? toStringList(intent.buying_signal_lexicon.ru, 40, 80).map((item) => item.toLowerCase())
      : BUYER_SIGNAL_MARKERS;
  const lexiconEn =
    intent?.buying_signal_lexicon && typeof intent.buying_signal_lexicon === "object"
      ? toStringList(intent.buying_signal_lexicon.en, 40, 80).map((item) => item.toLowerCase())
      : BUYER_SIGNAL_MARKERS;
  const lexicon = [...new Set([...lexiconRu, ...lexiconEn, ...BUYER_SIGNAL_MARKERS])]
    .filter((token) => token && !VENDOR_SIGNAL_MARKERS.includes(token));

  const directHits = lexicon.filter((token) => token && combined.includes(token)).length;
  let score = Math.min(70, directHits * 14);

  if (hasExplicitIntentSignal(combined)) score += 15;
  if (hasContactSignal(combined)) score += 8;
  if (/(тендер|закупк|rfp|request for proposal|ваканси|hiring|ищем|need|looking for)/i.test(combined)) {
    score += 12;
  }
  if (hasVendorSignal(combined) && !hasExplicitIntentSignal(combined)) {
    score -= 22;
  }

  return clampScore(score, 0);
};

const guessContactHint = (url, snippet) => {
  const sourceType = getSourceType(url || "");
  const combined = `${url || ""} ${snippet || ""}`.toLowerCase();
  if (/telegram|t\.me/.test(combined) || sourceType === "telegram") {
    return "Открыть канал/пост в Telegram и проверить описание/контакты администратора.";
  }
  if (/vk|vk\.com/.test(combined) || sourceType === "vk") {
    return "Открыть источник в VK и проверить профиль/контакты для связи.";
  }
  if (sourceType === "maps_yandex" || sourceType === "maps_2gis") {
    return "Открыть карточку компании и проверить кнопки звонка/сайта.";
  }
  return "Открыть страницу и проверить форму контакта, email или мессенджер.";
};

const buildRankProvidedContactHint = ({ sourceKind, url, language, status, needDomainRecommendations }) => {
  const hasUrl = Boolean(url && /^https?:\/\//i.test(String(url)));
  const needDomain = String(status || "").toUpperCase() === "NEED_DOMAIN";
  if (needDomain) {
    const recs = Array.isArray(needDomainRecommendations) ? needDomainRecommendations.slice(0, 3) : [];
    return language === "ru"
      ? `Где искать: ${recs.join(" / ") || "hh employer / 2GIS / Rusprofile"}. Открыть: карточку компании и поле «Сайт».`
      : `Where to find: ${recs.join(" / ") || "LinkedIn / Maps / registry card"}. Open: company card and website field.`;
  }
  const kind = String(sourceKind || "").toLowerCase();
  if (kind === "job") {
    return language === "ru"
      ? "Где искать: карточка работодателя на hh/superjob. Открыть: «О компании» и «Контакты»."
      : "Where: employer page on jobs board. Open: company profile and contacts/about section.";
  }
  if (kind === "tender") {
    return language === "ru"
      ? "Где искать: карточка тендера/закупки. Открыть: извещение и «Контакты заказчика»."
      : "Where: tender/procurement card. Open: notice and buyer contact section.";
  }
  if (kind === "social_post") {
    return language === "ru"
      ? "Где искать: исходный пост/канал. Открыть: пост и профиль автора/админа."
      : "Where: source social post/channel. Open: post and author/admin profile.";
  }
  if (kind === "directory" || kind === "maps_yandex" || kind === "maps_2gis") {
    return language === "ru"
      ? "Где искать: карточка каталога/карты. Открыть: карточку и перейти на официальный сайт."
      : "Where: directory/maps card. Open: listing and official website link.";
  }
  if (hasUrl) {
    return language === "ru"
      ? "Где искать: сайт компании. Открыть: страницу «Контакты» или «О компании»."
      : "Where: company website. Open: contacts/about page.";
  }
  return language === "ru"
    ? "Где искать: профиль компании в открытых каталогах. Открыть: карточку компании и раздел контактов."
    : "Where: public company profile. Open: company card and contacts section.";
};

const buildRankProvidedNextAction = ({ sourceKind, status, language }) => {
  const needDomain = String(status || "").toUpperCase() === "NEED_DOMAIN";
  if (needDomain) {
    return language === "ru"
      ? "Найти домен через hh employer / 2GIS / rusprofile и обновить строку."
      : "Find domain via employer/maps/registry card and update this row.";
  }
  const kind = String(sourceKind || "").toLowerCase();
  if (kind === "job") {
    return language === "ru"
      ? "Открыть профиль работодателя и найти контакт HRD/People Ops."
      : "Open employer profile and identify HRD/People Ops contact path.";
  }
  if (kind === "tender") {
    return language === "ru"
      ? "Открыть закупку и проверить раздел «Контакты заказчика»/отдел закупок."
      : "Open tender card and locate procurement contact section.";
  }
  if (kind === "social_post") {
    return language === "ru"
      ? "Открыть пост и написать автору/админу по шаблону HRD/COO."
      : "Open post and send outreach to author/admin using HRD/COO template.";
  }
  return language === "ru"
    ? "Открыть страницу контактов и отправить короткий первичный outreach."
    : "Open contacts page and send a short first outreach.";
};

const clampScore = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const buildScoringPrompt = ({ intent, candidates, searchTarget }) => {
  const targetMode = searchTarget === "competitor_scan" ? "competitor_scan" : "buyer_only";
  const compactIntent = {
    offer: intent.offer || {},
    icp: intent.icp || {},
    constraints: intent.constraints || {},
    buying_signal_lexicon: intent.buying_signal_lexicon || {},
    negative_lexicon: intent.negative_lexicon || {},
    product_or_service: intent.product_or_service || [],
    target_customer: intent.target_customer || [],
    geo: intent.geo || [],
    company_size: intent.company_size || [],
    industries: intent.industries || [],
    roles: intent.roles || [],
    buying_signals: intent.buying_signals || [],
    language: intent.language || "mixed",
    keywords: intent.keywords || [],
    synonyms_ru_en: intent.synonyms_ru_en || [],
    negative_keywords: intent.negative_keywords || [],
    must_not_have: intent.must_not_have || [],
    constraints_flat: intent.constraints || [],
    domains: intent.domains || []
  };

  const compactCandidates = candidates.map((item) => ({
    candidate_id: item.candidate_id,
    title: item.title || "",
    url: item.url || "",
    source: item.source || "",
    source_kind: item.source_kind || "company_page",
    snippet: sanitizeEvidenceSnippet(item.snippet || "", 220),
    page_excerpt: sanitizeEvidenceSnippet(item.page_text || "", 260)
  }));

  return [
    "RELEVANCE_AND_LEAD_SCORING",
    "Оцени кандидатов строго относительно intent. Это lead finder, не content discovery.",
    "Правила:",
    `- source_kind должен быть одним из: ${SOURCE_TYPES.join(" | ")}.`,
    `- entity_role должен быть одним из: ${ENTITY_ROLES.join(" | ")}.`,
    "- entity_role=vendor, если это страница поставщика/платформы с признаками продажи продукта.",
    "- entity_role=buyer, если есть сигнал потребности/закупки/поиска решения.",
    "- entity_role=media для статей/новостей/обзоров; entity_role=directory для каталогов.",
    `- target_mode: ${targetMode}.`,
    "- tender/job/social_post/directory/company_page допустимы для лидов; blog/article/forum/qna/dictionary => Drop.",
    "- В режиме buyer_only: если entity_role=vendor, lead_type должен быть Drop.",
    "- В режиме competitor_scan: vendor можно оставлять как Warm (не Hot).",
    "- Верни source_type для каждого кандидата.",
    "- relevance_score: 0..100.",
    "- intent_score: 0..100 (намерение купить/внедрить).",
    `- Если relevance_score < ${RELEVANCE_DROP_THRESHOLD}, lead_type должен быть Drop.`,
    `- Hot только при relevance_score >= ${HOT_THRESHOLD}, intent_score >= ${HOT_INTENT_THRESHOLD} и source_type в [tender, job, social_post, company_page].`,
    `- Warm при relevance_score >= ${RELEVANCE_THRESHOLD}, но без достаточного intent для Hot.`,
    "- Не выдумывай контакты, contact_hint только из URL/сниппета.",
    "",
    `intent_json: ${JSON.stringify(compactIntent)}`,
    `target_mode: ${targetMode}`,
    `candidates_json: ${JSON.stringify(compactCandidates)}`
  ].join("\n");
};

const normalizeScoredItem = ({
  item,
  fallback,
  fallbackIntentScore = 0,
  negativeKeywords,
  searchTarget = "buyer_only"
}) => {
  const safe = item && typeof item === "object" ? item : {};
  const fallbackResult =
    fallback && typeof fallback === "object"
      ? fallback
      : computeRelevance({
          title: safe.title || "",
          snippet: safe.snippet || "",
          url: safe.url || "",
          pageText: safe.page_text || "",
          intent: {},
          negativeKeywords
        });

  const relevanceScore = clampScore(
    safe.relevance_score,
    Number.isFinite(Number(fallbackResult?.confidence)) ? Number(fallbackResult.confidence) : 0
  );
  const fallbackIntent = clampScore(
    safe.fallback_intent_score,
    Number.isFinite(Number(fallbackIntentScore)) ? Number(fallbackIntentScore) : 0
  );
  const intentScore = clampScore(safe.intent_score, fallbackIntent);
  const sourceTypeRaw = normalizePhrase(safe.source_type, 40).toLowerCase();
  const sourceType = SOURCE_TYPES.includes(sourceTypeRaw) ? sourceTypeRaw : "other";
  const detectedEntityRole = classifyEntityRole({
    title: safe.title || "",
    snippet: safe.snippet || "",
    url: safe.url || "",
    pageText: safe.page_text || "",
    sourceType
  });
  const normalizedRole = normalizeEntityRole(safe.entity_role);
  const entityRole =
    normalizedRole === "other" && !String(safe.entity_role || "").trim()
      ? detectedEntityRole
      : normalizedRole;
  const reason =
    normalizePhrase(safe.reason, 240) ||
    (Array.isArray(fallbackResult?.reasons) ? fallbackResult.reasons[0] : "") ||
    "Релевантность подтверждена по intent.";
  const evidence = normalizePhrase(safe.evidence, 240) || "";
  const hasBuyingSignal =
    Boolean(safe.has_buying_signal) ||
    hasExplicitIntentSignal(`${reason} ${evidence} ${safe.snippet || ""} ${safe.title || ""}`);

  let leadType = String(safe.lead_type || "").trim();
  if (leadType !== "Hot" && leadType !== "Warm" && leadType !== "Drop") {
    leadType = relevanceScore >= RELEVANCE_THRESHOLD ? "Warm" : "Drop";
  }

  if (
    sourceType === "dictionary" ||
    sourceType === "forum/qna" ||
    sourceType === "blog/article"
  ) {
    leadType = "Drop";
  } else if (searchTarget !== "competitor_scan" && entityRole === "vendor") {
    leadType = "Drop";
  } else if (relevanceScore < RELEVANCE_DROP_THRESHOLD) {
    leadType = "Drop";
  } else if (
    entityRole === "buyer" &&
    relevanceScore >= HOT_THRESHOLD &&
    intentScore >= HOT_INTENT_THRESHOLD &&
    hasBuyingSignal &&
    (sourceType === "tender" ||
      sourceType === "job" ||
      sourceType === "social_post" ||
      sourceType === "company_page")
  ) {
    leadType = "Hot";
  } else if (relevanceScore >= RELEVANCE_THRESHOLD) {
    leadType = "Warm";
  } else {
    leadType = "Drop";
  }
  if (entityRole === "vendor" && searchTarget === "competitor_scan" && leadType === "Hot") {
    leadType = "Warm";
  }

  return {
    candidate_id: normalizePhrase(safe.candidate_id, 80),
    source_type: sourceType,
    entity_role: entityRole,
    relevance_score: relevanceScore,
    intent_score: intentScore,
    lead_type: leadType,
    has_buying_signal: hasBuyingSignal,
    reason,
    evidence,
    contact_hint: normalizePhrase(safe.contact_hint, 220) || "",
    filtered_by_negative_keyword: containsNegativeKeyword(
      `${safe.title || ""} ${safe.snippet || ""} ${safe.url || ""}`,
      negativeKeywords
    )
  };
};

const scoreCandidatesWithLLM = async ({
  candidates,
  intent,
  provider,
  negativeKeywords = new Set(),
  searchTarget = "buyer_only",
  mode = "quick"
}) => {
  const resultById = new Map();
  const llmCalls = [];
  let usage = normalizeUsage();
  const modelUsed = String(process.env.OPENAI_MODEL || "gpt-5-mini").trim() || "gpt-5-mini";

  for (let start = 0; start < candidates.length; start += SCORING_CHUNK_SIZE) {
    const chunk = candidates.slice(start, start + SCORING_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const call = {
      step: "RELEVANCE_AND_LEAD_SCORING",
      provider: provider?.name || "unknown",
      model: modelUsed,
      fetched_at: new Date().toISOString(),
      duration_ms: 0,
      status: "OK",
      error: "",
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      items_count: chunk.length
    };
    const started = Date.now();

    try {
      const response = await runWithTimeout(
        runProviderJsonWithUsage(provider, {
          system:
            "Ты оцениваешь лиды на релевантность запросу пользователя. Верни только JSON по схеме.",
          prompt: buildScoringPrompt({ intent, candidates: chunk, searchTarget }),
          schema: SEARCH_SCORING_SCHEMA,
          temperature: 0.1,
          maxTokens: 2200,
          meta: {
            agent_id: artemAgent.id,
            step: "RELEVANCE_AND_LEAD_SCORING",
            model: modelUsed,
            candidate_ids: chunk.map((item) => item.candidate_id)
          }
        }),
        mode === "quick" ? 12000 : 22000,
        "SCORING_TIMEOUT"
      );
      const currentUsage = normalizeUsage(response.usage);
      usage = addUsage(usage, currentUsage);
      call.duration_ms = Date.now() - started;
      call.prompt_tokens = currentUsage.prompt_tokens;
      call.completion_tokens = currentUsage.completion_tokens;
      call.total_tokens = currentUsage.total_tokens;

      const items = Array.isArray(response?.data?.items) ? response.data.items : [];
      const scoredById = new Map(
        items
          .map((item) => [normalizePhrase(item?.candidate_id, 80), item])
          .filter(([candidateId]) => Boolean(candidateId))
      );

      chunk.forEach((candidate) => {
        const fallback = computeRelevance({
          title: candidate.title,
          snippet: candidate.snippet,
          url: candidate.url,
          pageText: candidate.page_text,
          intent,
          negativeKeywords
        });
        const fallbackIntentScore = computeIntentScore({
          title: candidate.title,
          snippet: candidate.snippet,
          url: candidate.url,
          pageText: candidate.page_text,
          intent
        });
        const llmItem = scoredById.get(candidate.candidate_id);
        const scoredItem = normalizeScoredItem({
          item: {
            candidate_id: candidate.candidate_id,
            source_type: candidate.source_kind || "other",
            relevance_score: fallback.confidence,
            intent_score: fallbackIntentScore,
            fallback_intent_score: fallbackIntentScore,
            lead_type:
              fallback.confidence >= HOT_THRESHOLD && fallbackIntentScore >= HOT_INTENT_THRESHOLD
                ? "Hot"
                : fallback.confidence >= RELEVANCE_THRESHOLD
                  ? "Warm"
                  : "Drop",
            has_buying_signal: fallback.hasIntent,
            reason: (fallback.reasons || []).slice(0, 2).join(" "),
            evidence: candidate.snippet || candidate.title || "",
            contact_hint: guessContactHint(candidate.url, candidate.snippet),
            ...(llmItem && typeof llmItem === "object" ? llmItem : {})
          },
          fallback,
          fallbackIntentScore,
          negativeKeywords,
          searchTarget
        });
        if (!scoredItem.contact_hint) {
          scoredItem.contact_hint = guessContactHint(candidate.url, candidate.snippet);
        }
        if (!scoredItem.evidence) {
          scoredItem.evidence = sanitizeEvidenceSnippet(candidate.snippet || candidate.title || "", 180);
        }
        resultById.set(candidate.candidate_id, scoredItem);
      });
    } catch (error) {
      call.duration_ms = Date.now() - started;
      call.status = "ERROR";
      call.error = error instanceof Error ? error.message : "SCORING_FAILED";

      chunk.forEach((candidate) => {
        const fallback = computeRelevance({
          title: candidate.title,
          snippet: candidate.snippet,
          url: candidate.url,
          pageText: candidate.page_text,
          intent,
          negativeKeywords
        });
        const fallbackIntentScore = computeIntentScore({
          title: candidate.title,
          snippet: candidate.snippet,
          url: candidate.url,
          pageText: candidate.page_text,
          intent
        });
        const fallbackEntityRole = classifyEntityRole({
          title: candidate.title,
          snippet: candidate.snippet,
          url: candidate.url,
          pageText: candidate.page_text,
          sourceType: candidate.source_kind || "other"
        });
        const leadType =
          fallbackEntityRole === "vendor" && searchTarget !== "competitor_scan"
            ? "Drop"
            : fallback.confidence < RELEVANCE_DROP_THRESHOLD
              ? "Drop"
              : fallback.confidence >= HOT_THRESHOLD &&
                  fallbackIntentScore >= HOT_INTENT_THRESHOLD &&
                  fallback.hasIntent &&
                  fallbackEntityRole === "buyer"
                ? "Hot"
                : fallback.confidence >= RELEVANCE_THRESHOLD
                  ? "Warm"
                  : "Drop";
        resultById.set(candidate.candidate_id, {
          candidate_id: candidate.candidate_id,
          source_type: candidate.source_kind || "other",
          entity_role: fallbackEntityRole,
          relevance_score: fallback.confidence,
          intent_score: fallbackIntentScore,
          lead_type: leadType,
          has_buying_signal: fallback.hasIntent,
          reason: (fallback.reasons || []).slice(0, 2).join(" ") || "Fallback scoring",
          evidence: sanitizeEvidenceSnippet(candidate.snippet || candidate.title || "", 180),
          contact_hint: guessContactHint(candidate.url, candidate.snippet),
          filtered_by_negative_keyword: false
        });
      });
    }

    llmCalls.push(call);
  }

  return {
    scored: resultById,
    usage,
    calls: llmCalls
  };
};

const buildNegativeKeywordSet = ({ candidates, intent, searchTarget = "buyer_only" }) => {
  const intentTokens = buildIntentTokenSet(intent);
  const negative = new Set(
    toStringList(intent && Array.isArray(intent.negative_keywords) ? intent.negative_keywords : [], 20, 80).map(
      (item) => item.toLowerCase()
    )
  );
  if (searchTarget !== "competitor_scan") {
    VENDOR_NEGATIVE_KEYWORDS.forEach((token) => {
      if (token) negative.add(String(token).toLowerCase());
    });
  }
  const frequency = new Map();
  const vendorDomainFrequency = new Map();

  (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
    const text = `${candidate.title || ""} ${candidate.snippet || ""} ${candidate.url || ""}`.toLowerCase();
    if (containsNoiseMarker(text)) {
      detectNoiseTokensFromText(text).forEach((token) => negative.add(token));
    }
    if (searchTarget !== "competitor_scan" && hasVendorSignal(text)) {
      const domain = getDomainForDedupe(candidate.url || "");
      if (domain && domain.length >= 4) {
        vendorDomainFrequency.set(domain, (vendorDomainFrequency.get(domain) || 0) + 1);
      }
    }

    tokenizeTerms(text).forEach((token) => {
      if (intentTokens.has(token)) return;
      const next = (frequency.get(token) || 0) + 1;
      frequency.set(token, next);
    });
  });

  [...frequency.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([token]) => {
      if (NOISE_TOKEN_HINTS.includes(token)) negative.add(token);
    });

  if (searchTarget !== "competitor_scan") {
    [...vendorDomainFrequency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([domain]) => {
        negative.add(domain.toLowerCase());
      });
  }

  return negative;
};

const generateHotLeadFromText = (text, url, input) => {
  const signals = scoreHotSignals(text, input.keywords);
  const sourceType = getSourceType(url);
  const proofItems = buildProofItems(url, sourceType, signals.proofSignals, text);
  const summarySnippet = sanitizeEvidenceSnippet(text.slice(0, 200));
  const categoryHint = detectCategoryHint(text);
  const intentClass = classifyIntent(text);
  const explicitIntent = hasExplicitHotIntent(text, intentClass);
  const privacyRisk = sourceType === "vk" || sourceType === "telegram";
  const recencyHint = extractRecencyHint(text);
  const replyAngleOptions = buildReplyAngleOptions(intentClass, privacyRisk);
  const qualificationQuestion = buildQualificationQuestion(intentClass);
  const suggestedFirstContact = privacyRisk
    ? "Мягкий нейтральный заход: предложить 1 практичный шаг без ссылки на конкретный комментарий."
    : "Коротко уточнить задачу и сроки, предложить быстрый аудит/план на 3–5 дней.";
  const whyMatch =
    signals.reasons.slice(0, 2).join(" ") ||
    "Найден релевантный фрагмент выдачи, требуется уточнение намерения.";

  const contactHint = (() => {
    if (sourceType === "vk") {
      return "Открыть источник в VK и проверить публичные контакты/возможность написать в ЛС.";
    }
    if (sourceType === "telegram") {
      return "Открыть источник в Telegram и проверить описание канала/контакты администратора.";
    }
    if (sourceType === "maps_yandex" || sourceType === "maps_2gis") {
      return "Открыть карточку на картах и проверить кнопки звонка/сайта.";
    }
    return "Открыть сайт и проверить страницу контактов, форму или публичные каналы связи.";
  })();

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
    why_match: whyMatch,
    evidence: summarySnippet,
    contact_hint: contactHint,
    confidence: Math.max(0, Math.min(100, signals.score)),
    is_hot_lead: signals.score >= HOT_THRESHOLD && explicitIntent,
    explicit_intent: explicitIntent,
    lead_type: signals.score >= HOT_THRESHOLD && explicitIntent ? "Hot" : "Warm",
    recency_hint: recencyHint,
    dedupe_key: "",
    proof_refs: []
  };

  const dedupeKey = buildDedupeKey(url, text, input);
  lead.dedupe_key = dedupeKey;

  return { lead, proofItems };
};

const buildFallbackWarmTargets = ({ intent, limit = 12 }) => {
  const language = String(intent?.language || "mixed").toLowerCase();
  const industries = toStringList(
    intent?.icp?.industries || intent?.industries || [],
    14,
    90
  );
  const roles = toStringList(intent?.icp?.roles || intent?.roles || [], 14, 90);
  const geo = toStringList(intent?.icp?.geo || intent?.geo || [], 4, 80);
  const keywords = toStringList(intent?.offer?.keywords || intent?.keywords || [], 10, 80);
  const offerName = normalizePhrase(
    intent?.offer?.product_or_service || keywords[0] || (language === "ru" ? "решение" : "solution"),
    120
  );
  const resolvedIndustries =
    industries.length > 0 ? industries : language === "ru" ? DEFAULT_INDUSTRIES_RU : DEFAULT_INDUSTRIES_EN;
  const resolvedRoles =
    roles.length > 0 ? roles : language === "ru" ? DEFAULT_ROLES_RU : DEFAULT_ROLES_EN;

  const warm = [];
  const seen = new Set();

  for (const industry of resolvedIndustries) {
    for (const role of resolvedRoles) {
      if (warm.length >= limit) break;
      const key = `${industry}|${role}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const geoText = geo.length > 0 ? geo.join(", ") : language === "ru" ? "по языку запроса" : "language-default geo";
      const who = language === "ru" ? `${industry} компании` : `${industry} companies`;
      const whereToFind =
        language === "ru"
          ? "Поиск ЛПР: сайт компании, раздел контактов, вакансии и закупки."
          : "Find decision makers via company website, contacts page, jobs and tenders.";
      warm.push({
        title: `${offerName}: ${industry} / ${role}`,
        source: "intent-discovery",
        source_type: "directory",
        url: "",
        geo_hint: geoText,
        request_summary:
          language === "ru"
            ? `ICP match: ${industry}, роль ${role}.`
            : `ICP match: ${industry}, role ${role}.`,
        hot_score: 76,
        intent_class: "other",
        hot_reasons: [
          language === "ru"
            ? "Сегмент совпадает с ICP пользователя."
            : "Segment matches user ICP."
        ],
        reply_angle_options: buildReplyAngleOptions("other", false),
        qualification_question: buildQualificationQuestion("other"),
        suggested_first_contact:
          language === "ru"
            ? "Начать с короткого value-prop и вопроса про текущий процесс."
            : "Start with short value proposition and a process qualification question.",
        risk_flags: {
          no_budget_mentioned: true,
          anonymous_author: true,
          outdated: false,
          privacy_risk: false
        },
        why_match:
          language === "ru"
            ? `Подходит по ICP: ${industry}, роль ${role}.`
            : `ICP match: ${industry}, role ${role}.`,
        why_now:
          language === "ru"
            ? "Warm target без явного buying signal."
            : "Warm target without explicit buying signal.",
        where_to_contact: whereToFind,
        evidence:
          language === "ru"
            ? "Сформировано по intent пользователя и ICP допущениям."
            : "Generated from user intent and ICP assumptions.",
        contact_hint: whereToFind,
        confidence: 76,
        is_hot_lead: false,
        explicit_intent: false,
        lead_type: "Warm",
        recency_hint: "unknown",
        dedupe_key: `warm:${key}`,
        proof_refs: [],
        company_or_organization: who,
        who
      });
    }
  }

  return warm.slice(0, limit);
};

const PROVIDED_LINE_NOISE_REGEX =
  /(найд[ий]|горяч(ий|ие|их)|лид(ы|ов)?|суть сайта|моего сайта|чтобы сотрудники|компании от \d+)/i;

const PROVIDED_COMPANY_REGEX =
  /(ООО|АО|ПАО|ИП|LLC|Inc\.?|Ltd\.?|Corp\.?|Company|Компания|компания|Бренд|Brand)/i;

const PROVIDED_DOMAIN_REGEX = /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/i;

const NEED_DOMAIN_SOURCES_RU = [
  "hh.ru/employers (профиль работодателя)",
  "2gis.ru (карточка компании)",
  "rusprofile.ru (карточка юрлица)"
];

const NEED_DOMAIN_SOURCES_EN = [
  "LinkedIn company page",
  "Google Maps company card",
  "company registry / official profile"
];

const getProvidedInputSections = (input) => {
  const hasRawInput = Boolean(input?.raw_text_provided);
  const raw = hasRawInput ? String(input?.raw_text || "").trim() : "";
  const fallback = raw ? "" : String(input?.query_text || input?.raw_text || "").trim();
  const source = raw || fallback;
  if (!source) return { primary: "", attachmentSnippets: [], hasRawInput };

  const primary = normalizeWhitespace(
    source
      .split(/\n\nКонтекст диалога:/i)[0]
      .split(/\n\nВложения пользователя:/i)[0]
  );

  const attachmentRaw = source.split(/\n\nВложения пользователя:/i)[1] || "";
  const attachmentSnippets = attachmentRaw
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .map((line) => {
      const pivot = line.indexOf(":");
      return pivot >= 0 ? normalizeWhitespace(line.slice(pivot + 1)) : "";
    })
    .filter(Boolean)
    .filter((snippet) => !/^(image attached|available to review)$/i.test(snippet));

  return { primary, attachmentSnippets, hasRawInput };
};

const normalizeProvidedLine = (line) =>
  normalizeWhitespace(String(line || "").replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, ""));

const toProvidedUrl = (value) => {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  const withProtocol = text.match(/https?:\/\/[^\s)]+/i);
  if (withProtocol) {
    return canonicalizeUrl(withProtocol[0]);
  }
  const domain = text.match(PROVIDED_DOMAIN_REGEX);
  if (!domain) return "";
  return canonicalizeUrl(`https://${domain[0].toLowerCase()}`);
};

const extractProvidedDomain = (value) => {
  const url = toProvidedUrl(value);
  if (url) return getDomainForDedupe(url);
  const domain = String(value || "").match(PROVIDED_DOMAIN_REGEX);
  return domain ? normalizePhrase(domain[0].toLowerCase(), 120) : "";
};

const parsePipeCandidate = (line) => {
  if (!line.includes("|")) return null;
  const rawParts = line.split("|").map((item) => normalizeWhitespace(item));
  if (rawParts.length < 2) return null;
  const company = normalizePhrase(rawParts[0] || "", 180);
  const domainOrUrl = normalizeWhitespace(rawParts[1] || "");
  const city = normalizePhrase(rawParts[2] || "", 80);
  const sourceHint = normalizePhrase(rawParts[3] || "", 120);
  const url = toProvidedUrl(domainOrUrl);
  const domain = extractProvidedDomain(domainOrUrl);
  const hasRecommendedShape = rawParts.length >= 4 || (rawParts.length >= 2 && company.length >= 2);
  if (!hasRecommendedShape || (!company && !domain && !url)) return null;
  return {
    title: company || domain || "Provided item",
    url,
    domain,
    city,
    source_note: sourceHint,
    snippet: normalizePhrase(line, 360),
    source: sourceHint || "provided",
    parse_format: "recommended_pipe",
    domain_status: domain || url ? "OK" : "NEED_DOMAIN"
  };
};

const parseUrlCandidates = (line) => {
  const urlRegex = /https?:\/\/[^\s)]+/gi;
  const matches = [...line.matchAll(urlRegex)];
  if (!matches.length) return [];
  return matches
    .map((match) => {
      const urlRaw = String(match[0] || "").trim();
      const url = toProvidedUrl(urlRaw);
      const title = normalizePhrase(line.replace(urlRaw, "").replace(/[-–—|:]+/g, " "), 220);
      if (!url) return null;
      return {
        title: title || url,
        url,
        domain: getDomainForDedupe(url),
        city: "",
        source_note: "",
        snippet: normalizePhrase(line, 360),
        source: getDomainForDedupe(url) || "provided",
        parse_format: "url",
        domain_status: "OK"
      };
    })
    .filter(Boolean);
};

const parseCompanyOnlyCandidate = (line) => {
  if (!line) return null;
  if (line.includes("|") || /https?:\/\//i.test(line)) return null;
  if (PROVIDED_LINE_NOISE_REGEX.test(line)) return null;
  const lowered = line.toLowerCase();
  if (/(контекст диалога|вложения пользователя)/i.test(lowered)) return null;
  if (/(ищем|нужно|выбираем|внедряем|тендер|закупка|подрядчик|поставщик)/i.test(lowered) && !PROVIDED_COMPANY_REGEX.test(line)) {
    return null;
  }

  const primaryPart = normalizePhrase(line.split(/[-–—]/)[0], 180);
  const fallback = normalizePhrase(line, 180);
  const company = primaryPart && primaryPart.length >= 3 ? primaryPart : fallback;
  if (!company || company.length < 3 || company.length > 180) return null;

  const tokenCount = tokenizeTerms(company).length;
  if (tokenCount > 8) return null;
  if (!PROVIDED_COMPANY_REGEX.test(company) && !/^[A-ZА-ЯЁ]/.test(company)) return null;

  return {
    title: company,
    url: "",
    domain: "",
    city: "",
    source_note: "",
    snippet: fallback || company,
    source: "provided",
    parse_format: "company_name_only",
    domain_status: "NEED_DOMAIN"
  };
};

const extractProvidedCandidates = (input) => {
  const { primary, attachmentSnippets, hasRawInput } = getProvidedInputSections(input);
  const primaryLines = primary
    .split(/\r?\n/)
    .map((line) => normalizeProvidedLine(line))
    .filter(Boolean);

  const hasUrlInPrimary = /https?:\/\/[^\s)]+/i.test(primary);
  const tableLikeLines = primaryLines.filter((line) => line.includes("|") && line.split("|").length >= 2);
  const companyMarkersInPrimary = (primary.match(/ООО|АО|ПАО|ИП|LLC|Inc\.?|Ltd\.?|Corp\.?|Company|Компания/gi) || [])
    .length;

  const attachmentStructured = attachmentSnippets.filter((snippet) => {
    if (/https?:\/\/[^\s)]+/i.test(snippet)) return true;
    if (snippet.includes("|") && snippet.split("|").length >= 2) return true;
    return PROVIDED_COMPANY_REGEX.test(snippet);
  });

  const hasEnoughListRows = hasRawInput ? primaryLines.length >= 1 : primaryLines.length >= 3;
  const hasStructuredList =
    hasUrlInPrimary ||
    tableLikeLines.length >= 1 ||
    companyMarkersInPrimary >= 2 ||
    hasEnoughListRows ||
    attachmentStructured.length > 0;

  if (!hasStructuredList) {
    return [];
  }

  const lines = [
    ...primaryLines,
    ...attachmentStructured.map((item) => normalizeProvidedLine(item))
  ].filter(Boolean);

  const candidates = [];
  const seenUrl = new Set();
  const seenTitle = new Set();
  const language = detectLanguage(`${primary} ${attachmentSnippets.join(" ")}`);
  const needDomainSources = language === "en" ? NEED_DOMAIN_SOURCES_EN : NEED_DOMAIN_SOURCES_RU;

  const pushCandidate = ({
    title = "",
    url = "",
    domain = "",
    city = "",
    source_note = "",
    snippet = "",
    source = "",
    source_kind = "",
    parse_format = "",
    domain_status = ""
  }) => {
    const safeTitle = normalizePhrase(title || snippet || url || "", 220);
    const safeUrl = normalizePhrase(url || "", 500);
    const safeDomain = normalizePhrase(domain || "", 120).toLowerCase();
    const safeCity = normalizePhrase(city || "", 80);
    const safeSourceNote = normalizePhrase(source_note || "", 120);
    const safeSnippet = normalizePhrase(snippet || "", 360);
    const canonical = safeUrl && /^https?:\/\//i.test(safeUrl) ? canonicalizeUrl(safeUrl) : "";
    const resolvedDomain = safeDomain || (canonical ? getDomainForDedupe(canonical) : "");
    const status = domain_status || (resolvedDomain ? "OK" : "NEED_DOMAIN");
    const titleKey = safeTitle.toLowerCase();
    if (canonical && seenUrl.has(canonical)) return;
    if (!canonical && titleKey && seenTitle.has(titleKey)) return;
    if (!safeTitle && !canonical) return;
    if (canonical) seenUrl.add(canonical);
    if (titleKey) seenTitle.add(titleKey);
    const kind = source_kind || detectSourceKind(canonical || safeUrl || "", `${safeTitle} ${safeSnippet}`);
    candidates.push({
      title: safeTitle || canonical || "Provided item",
      url: canonical || safeUrl || "",
      snippet: safeSnippet || safeTitle,
      source: source || safeSourceNote || (canonical ? getDomainForDedupe(canonical) : "provided"),
      source_kind: kind,
      domain: resolvedDomain,
      city: safeCity,
      source_note: safeSourceNote,
      parse_format: normalizePhrase(parse_format || "", 60),
      domain_status: status,
      need_domain_recommendations: status === "NEED_DOMAIN" ? [...needDomainSources] : [],
      provided: true
    });
  };

  lines.forEach((line) => {
    if (!line || PROVIDED_LINE_NOISE_REGEX.test(line)) return;

    const pipeCandidate = parsePipeCandidate(line);
    if (pipeCandidate) {
      pushCandidate(pipeCandidate);
      return;
    }

    const urlCandidates = parseUrlCandidates(line);
    if (urlCandidates.length > 0) {
      urlCandidates.forEach((item) => pushCandidate(item));
      return;
    }

    const companyOnly = parseCompanyOnlyCandidate(line);
    if (companyOnly) {
      pushCandidate(companyOnly);
    }
  });

  return candidates.slice(0, 220);
};

const SOURCE_PACKS_RU = {
  contact_centers: [
    { name: "HH работодатели", type: "jobs directory", where: "hh.ru/employers + фильтр «контакт-центр/поддержка»" },
    { name: "2ГИС рубрика «Колл-центры»", type: "catalog", where: "2gis.ru по городам, собрать карточки компаний" },
    { name: "Яндекс Карты рубрика «Call-центр»", type: "maps catalog", where: "yandex.ru/maps с фильтрацией по региону" },
    { name: "Rusprofile по ОКВЭД 82.20", type: "legal entities", where: "rusprofile.ru/okved/82.20" }
  ],
  clinics: [
    { name: "ПроДокторов/НаПоправку", type: "industry catalog", where: "каталоги клиник и сетей, выгрузка названий" },
    { name: "2ГИС «Медицинские центры»", type: "catalog", where: "2gis.ru + фильтр «сеть/филиалы»" },
    { name: "Яндекс Карты «Клиники»", type: "maps catalog", where: "yandex.ru/maps в крупных городах" },
    { name: "HH работодатели (медицина)", type: "jobs directory", where: "hh.ru/employers + отрасль «Медицина»" }
  ],
  logistics_3pl: [
    { name: "ATI.SU каталог перевозчиков", type: "industry marketplace", where: "ati.su, раздел компаний/перевозчиков" },
    { name: "2ГИС «Складские услуги/3PL»", type: "catalog", where: "2gis.ru по запросам «склад», «фулфилмент»" },
    { name: "Рейтинг логистических операторов", type: "rankings", where: "CNews/Logirus/RAEX — списки участников" },
    { name: "HH работодатели (логистика)", type: "jobs directory", where: "hh.ru/employers + логистика и ВЭД" }
  ],
  courier: [
    { name: "2ГИС «Курьерские службы»", type: "catalog", where: "2gis.ru по регионам и сетям" },
    { name: "Яндекс Карты «Служба доставки»", type: "maps catalog", where: "yandex.ru/maps + сортировка по городам" },
    { name: "Реестры/ассоциации логистики", type: "associations", where: "профильные ассоциации и списки участников" },
    { name: "HH работодатели (доставка)", type: "jobs directory", where: "hh.ru/employers + категории delivery/logistics" }
  ],
  finance_insurance: [
    { name: "Banki.ru/Сравни", type: "sector lists", where: "списки банков/страховых компаний" },
    { name: "ЦБ РФ справочники", type: "official registry", where: "cbr.ru — участники финансового рынка" },
    { name: "HH работодатели (банки/страхование)", type: "jobs directory", where: "hh.ru/employers + отрасль финансы" },
    { name: "Rusprofile (банковские/страховые группы)", type: "legal entities", where: "по ОКВЭД и холдингам" }
  ],
  manufacturing: [
    { name: "Сделано у нас / отраслевые каталоги", type: "industry lists", where: "списки производственных предприятий" },
    { name: "2ГИС «Заводы/производства»", type: "catalog", where: "2gis.ru по промышленным регионам" },
    { name: "HH работодатели (производство)", type: "jobs directory", where: "hh.ru/employers + отрасль «Производство»" },
    { name: "Rusprofile по промышленным ОКВЭД", type: "legal entities", where: "по кодам C и смежным направлениям" }
  ],
  retail_horeca: [
    { name: "2ГИС сети магазинов/кафе", type: "catalog", where: "2gis.ru + фильтр сетевых брендов" },
    { name: "Retail.ru / New Retail", type: "industry media lists", where: "рейтинги и списки ритейл-сетей" },
    { name: "Яндекс Карты категории retail/food", type: "maps catalog", where: "по городам и федеральным брендам" },
    { name: "HH работодатели (ритейл/FMCG)", type: "jobs directory", where: "hh.ru/employers + розничная торговля" }
  ],
  transport_fleet: [
    { name: "ATI.SU компании", type: "industry marketplace", where: "ati.su — карточки перевозчиков и автопарков" },
    { name: "2ГИС «Грузоперевозки»", type: "catalog", where: "2gis.ru, сегмент автоперевозок" },
    { name: "Ассоциации перевозчиков", type: "associations", where: "реестры членов отраслевых союзов" },
    { name: "HH работодатели (транспорт)", type: "jobs directory", where: "hh.ru/employers + транспортный сектор" }
  ],
  facility_security: [
    { name: "2ГИС «Клининг/Фасилити/Охрана»", type: "catalog", where: "2gis.ru по сервисным категориям" },
    { name: "Ассоциации клининга и безопасности", type: "associations", where: "списки участников отраслевых объединений" },
    { name: "Яндекс Карты сервисных компаний", type: "maps catalog", where: "yandex.ru/maps + крупные города" },
    { name: "HH работодатели (facility/security)", type: "jobs directory", where: "hh.ru/employers + операционные сервисы" }
  ],
  it_service: [
    { name: "CNews/Рейтинг Рунета/Tagline", type: "rankings", where: "локальные рейтинги интеграторов и сервис-десков" },
    { name: "Хабр Карьера компании", type: "jobs directory", where: "career.habr.com/companies" },
    { name: "HH работодатели (IT услуги)", type: "jobs directory", where: "hh.ru/employers + IT, outsourcing, support" },
    { name: "VC/рейтинги интеграторов", type: "rankings", where: "списки интеграторов и MSP с командами поддержки" },
    {
      name: "Clutch/GoodFirms",
      type: "global service directories",
      where: "использовать только в режиме «Глобально»",
      global_only: true
    }
  ],
  education_public: [
    { name: "Навигатор/каталоги образовательных учреждений", type: "catalog", where: "федеральные и региональные каталоги учреждений" },
    { name: "2ГИС «Учебные центры/вузы»", type: "catalog", where: "2gis.ru с фильтром по сетям/кампусам" },
    { name: "HH работодатели (образование)", type: "jobs directory", where: "hh.ru/employers + отрасль образование" },
    { name: "Списки участников отраслевых конференций", type: "event lists", where: "программы и списки экспонентов" }
  ]
};

const SEGMENT_CATALOG_RU = [
  {
    id: "bpo-contact-centers",
    industry_key: "bpo",
    segment_name: "BPO контакт-центры",
    niche: "аутсорс клиентского сервиса",
    pain_trigger: "высокая текучка операторов и давление по SLA одновременно",
    source_pack: "contact_centers",
    match_terms: ["bpo", "контакт", "колл", "support", "оператор", "sla"],
    priority: 96,
    hrd_hook: "Если текучка в линии >10% в квартал, пульс-опросы снижают потери адаптации и найма.",
    coo_hook: "Снимайте риск срыва SLA: ранние сигналы стресса помогают стабилизировать смены до инцидентов."
  },
  {
    id: "bank-insurance-call-centers",
    industry_key: "finserv",
    segment_name: "Call-центры банков и страховых",
    niche: "финансовый клиентский сервис",
    pain_trigger: "эмоционально тяжёлые обращения и строгие KPI качества",
    source_pack: "finance_insurance",
    match_terms: ["банк", "страх", "финанс", "call", "support", "kpi"],
    priority: 95,
    hrd_hook: "Для фронта финансового сервиса важна ранняя диагностика выгорания, иначе растёт текучка в критичных сменах.",
    coo_hook: "Операционно это защита NPS и соблюдения стандартов — меньше просадок на пиковых очередях."
  },
  {
    id: "clinic-networks-10plus",
    industry_key: "healthcare",
    segment_name: "Сети клиник 10+ филиалов",
    niche: "частная медицина и диагностические сети",
    pain_trigger: "разный уровень сервиса между филиалами и риск потери лояльности",
    source_pack: "clinics",
    match_terms: ["клиник", "мед", "филиал", "пациент", "сеть"],
    priority: 93,
    hrd_hook: "Пульс команды по филиалам показывает, где персонал перегружен до роста текучки медрегистратуры.",
    coo_hook: "Сравнение филиалов по стресс-сигналам помогает выровнять сервис и загрузку персонала."
  },
  {
    id: "3pl-warehouses",
    industry_key: "logistics",
    segment_name: "3PL склады и фулфилмент-операторы",
    niche: "складская логистика и исполнение заказов",
    pain_trigger: "сменные нагрузки и сезонные пики провоцируют ошибки комплектации",
    source_pack: "logistics_3pl",
    match_terms: ["3pl", "склад", "фулфилмент", "логист", "смен"],
    priority: 94,
    hrd_hook: "В сменных складах выгорание часто скрыто до увольнения — регулярный pulse сокращает внезапные потери людей.",
    coo_hook: "Меньше срывов отгрузки: стресс-индикаторы показывают где проваливаются процессы до ошибок SLA."
  },
  {
    id: "courier-last-mile",
    industry_key: "courier",
    segment_name: "Курьерские службы и last-mile delivery",
    niche: "городская и региональная доставка",
    pain_trigger: "плавающая нагрузка, жалобы клиентов и высокие риски оттока исполнителей",
    source_pack: "courier",
    match_terms: ["курьер", "доставк", "last-mile", "fleet", "логист"],
    priority: 92,
    hrd_hook: "Для курьерских команд pulse-опросы помогают удерживать исполнителей в пиковые периоды.",
    coo_hook: "Стабилизация линии доставки начинается с раннего сигнала по перегрузке маршрутов и бригад."
  },
  {
    id: "manufacturing-24x7",
    industry_key: "manufacturing",
    segment_name: "Производства со сменами 24/7",
    niche: "заводы и непрерывные производственные линии",
    pain_trigger: "ночные смены и переработки повышают риски ошибок и травматизма",
    source_pack: "manufacturing",
    match_terms: ["производ", "завод", "смен", "24/7", "цех"],
    priority: 93,
    hrd_hook: "Система pulse помогает HR видеть критические смены до всплеска увольнений и больничных.",
    coo_hook: "Для COO это инструмент снижения операционных инцидентов и брака на перегруженных линиях."
  },
  {
    id: "retail-networks-50plus",
    industry_key: "retail",
    segment_name: "Ритейл-сети 50+ магазинов",
    niche: "розничные сети с территориальной распределённостью",
    pain_trigger: "неравномерная текучка и качество сервиса между магазинами",
    source_pack: "retail_horeca",
    match_terms: ["ритейл", "магазин", "сеть", "розниц", "кассир"],
    priority: 91,
    hrd_hook: "По магазинам легко увидеть «красные зоны» текучки и вовремя перераспределить поддержку HRBP.",
    coo_hook: "Сегментируйте риск по регионам и не допускайте просадки клиентского сервиса в пиковые часы."
  },
  {
    id: "qsr-cafe-chains",
    industry_key: "horeca",
    segment_name: "Сети кафе/QSR 20+ точек",
    niche: "HoReCa с высокой долей линейного персонала",
    pain_trigger: "частые замены смен и жалобы гостей при недоукомплектованных командах",
    source_pack: "retail_horeca",
    match_terms: ["horeca", "кафе", "qsr", "ресторан", "смен"],
    priority: 89,
    hrd_hook: "В QSR удержание сменного персонала напрямую связано с регулярной анонимной обратной связью.",
    coo_hook: "Pulse-данные помогают не доводить до каскадных срывов смен и падения скорости обслуживания."
  },
  {
    id: "transport-fleets",
    industry_key: "transport",
    segment_name: "Транспортные компании и автопарки",
    niche: "грузоперевозки и диспетчеризация",
    pain_trigger: "усталость водителей и напряжение диспетчерских смен",
    source_pack: "transport_fleet",
    match_terms: ["автопарк", "перевоз", "диспетчер", "водител", "fleet"],
    priority: 88,
    hrd_hook: "Для HR это контроль риска увольнений в ядре водительского состава и диспетчерских смен.",
    coo_hook: "Операционно меньше срывов рейсов: сигналы перегруза помогают корректировать план раньше."
  },
  {
    id: "facility-security",
    industry_key: "facility",
    segment_name: "Фасилити, клининг и охранные сети",
    niche: "сервисные подрядчики с распределённым персоналом",
    pain_trigger: "массовые смены на объектах и низкая прозрачность состояния команд",
    source_pack: "facility_security",
    match_terms: ["клининг", "охрана", "фасилити", "объект", "смен"],
    priority: 90,
    hrd_hook: "Анонимная обратная связь по объектам снижает внезапный отток и конфликтность смен.",
    coo_hook: "Для COO это раннее обнаружение срывов на объектах до жалоб заказчика."
  },
  {
    id: "it-service-desk-247",
    industry_key: "it_services",
    segment_name: "IT service desk/поддержка 24/7",
    niche: "MSP и аутсорс IT-поддержки",
    pain_trigger: "ночные инциденты и перегрузка L1/L2 команд",
    source_pack: "it_service",
    match_terms: ["service desk", "it support", "msp", "l1", "l2", "инцидент"],
    priority: 90,
    hrd_hook: "В IT-поддержке pulse помогает вовремя удержать специалистов до роста критичного attrition.",
    coo_hook: "Это снижает риск деградации SLA при перегруженных очередях инцидентов."
  },
  {
    id: "b2b-saas-customer-success",
    industry_key: "saas",
    segment_name: "B2B SaaS с большими Customer Success командами",
    niche: "аккаунтинг, поддержка и onboarding клиентов",
    pain_trigger: "рост клиентской базы без синхронного усиления команды",
    source_pack: "it_service",
    match_terms: ["saas", "customer success", "onboarding", "account", "support"],
    priority: 86,
    hrd_hook: "Pulse-опросы помогают удерживать CSM-команды при быстром масштабировании клиентской базы.",
    coo_hook: "Оперпотери на churn снижаются, когда команда перегрузки видна заранее."
  },
  {
    id: "pharma-networks",
    industry_key: "pharma",
    segment_name: "Аптечные сети 100+ точек",
    niche: "фарм-ритейл",
    pain_trigger: "разброс нагрузки по точкам и постоянный стресс у первостольников",
    source_pack: "clinics",
    match_terms: ["аптек", "фарма", "сеть", "точек"],
    priority: 85,
    hrd_hook: "Снижайте текучку линейного персонала через быстрый feedback по регионам.",
    coo_hook: "Сегментация перегруза по точкам помогает стабилизировать операционные KPI."
  },
  {
    id: "diagnostic-lab-networks",
    industry_key: "diagnostics",
    segment_name: "Сети лабораторий и диагностических центров",
    niche: "медицинская диагностика",
    pain_trigger: "пиковые окна приёма и хроническая усталость front-office команд",
    source_pack: "clinics",
    match_terms: ["лаборатор", "диагност", "медицин", "филиал"],
    priority: 84,
    hrd_hook: "Регулярный pulse предотвращает выгорание администраторов и лаборантов в пиковые смены.",
    coo_hook: "Ранние сигналы по филиалам снижают операционные просадки в пациентском сервисе."
  },
  {
    id: "telecom-support-centers",
    industry_key: "telecom",
    segment_name: "Службы поддержки telecom/интернет-провайдеров",
    niche: "массовая техническая поддержка",
    pain_trigger: "стресс от конфликтных обращений и очередей заявок",
    source_pack: "contact_centers",
    match_terms: ["telecom", "провайдер", "поддержк", "интернет", "заявк"],
    priority: 87,
    hrd_hook: "Pulse-опросы по линиям поддержки удерживают операторов при высоком конфликтном трафике.",
    coo_hook: "Это позволяет стабилизировать скорость ответа и удержать SLA в аварийные дни."
  },
  {
    id: "franchise-networks",
    industry_key: "franchise",
    segment_name: "Франчайзинговые сети с региональными партнёрами",
    niche: "распределённые бизнес-единицы",
    pain_trigger: "разная зрелость команд и слабая прозрачность по филиалам",
    source_pack: "retail_horeca",
    match_terms: ["франшиз", "партнер", "сеть", "филиал"],
    priority: 84,
    hrd_hook: "Единый pulse-стандарт помогает синхронизировать HR-практики по всей франшизе.",
    coo_hook: "Для COO это способ быстро видеть проблемные регионы до ухудшения юнит-экономики."
  },
  {
    id: "airport-ground-services",
    industry_key: "aviation_ops",
    segment_name: "Аэропортовые и наземные сервисы",
    niche: "операции с жёсткими временными окнами",
    pain_trigger: "интенсивные смены и высокая стоимость ошибок в пиковые часы",
    source_pack: "transport_fleet",
    match_terms: ["аэропорт", "ground", "смен", "операц"],
    priority: 82,
    hrd_hook: "Pulse помогает удерживать ключевой линейный персонал в высокострессовой среде.",
    coo_hook: "Ранние сигналы по сменам помогают избежать каскадных срывов операционных окон."
  },
  {
    id: "construction-site-holdings",
    industry_key: "construction",
    segment_name: "Строительные холдинги с несколькими площадками",
    niche: "проектные и производственные стройкоманды",
    pain_trigger: "распределённые объекты и перегруз руководителей смен",
    source_pack: "facility_security",
    match_terms: ["строител", "площадк", "объект", "смен"],
    priority: 83,
    hrd_hook: "Анонимная обратная связь выявляет «узкие места» по объектам до кадровых потерь.",
    coo_hook: "Для COO это инструмент стабилизации темпа работ и снижения срывов по площадкам."
  },
  {
    id: "energy-utilities-shifts",
    industry_key: "energy",
    segment_name: "Энергетика и коммунальные службы со сменным графиком",
    niche: "операционные бригады 24/7",
    pain_trigger: "дежурства и аварийные выезды создают хронический стресс персонала",
    source_pack: "manufacturing",
    match_terms: ["энерг", "коммун", "дежур", "авар", "бригад"],
    priority: 82,
    hrd_hook: "Pulse позволяет вовремя увидеть усталость дежурных бригад и снизить текучку.",
    coo_hook: "Сервисная устойчивость выше, когда риски по сменам видны заранее."
  },
  {
    id: "public-service-outsourcers",
    industry_key: "public_services",
    segment_name: "Подрядчики госуслуг и МФЦ-подобных сервисов",
    niche: "массовый клиентский поток и регламентные KPI",
    pain_trigger: "строгие SLA и перегруз фронт-линии в пиковые периоды",
    source_pack: "education_public",
    match_terms: ["госуслуг", "мфц", "регламент", "sla"],
    priority: 81,
    hrd_hook: "Пульс команд в регламентной среде помогает удерживать персонал на фронте.",
    coo_hook: "Это снижает риск очередей и срывов нормативных сроков обслуживания."
  },
  {
    id: "edu-multi-campus",
    industry_key: "education",
    segment_name: "Сети частного образования/мультикампусные вузы",
    niche: "образовательные организации с несколькими площадками",
    pain_trigger: "разрозненные команды и слабая прозрачность настроения сотрудников",
    source_pack: "education_public",
    match_terms: ["образован", "кампус", "вуз", "школ"],
    priority: 80,
    hrd_hook: "Регулярный pulse снижает выгорание преподавательских и административных команд.",
    coo_hook: "Единая картина по кампусам помогает выравнивать операционные стандарты."
  },
  {
    id: "marketplace-seller-operations",
    industry_key: "marketplace",
    segment_name: "Операционные команды крупных селлеров маркетплейсов",
    niche: "категорийные и контент-команды e-commerce",
    pain_trigger: "постоянные пики задач и скорость изменений ассортимента",
    source_pack: "retail_horeca",
    match_terms: ["marketplace", "wb", "ozon", "селлер", "e-commerce"],
    priority: 85,
    hrd_hook: "Pulse помогает удерживать ключевые операционные команды в сезонные пики.",
    coo_hook: "Ранние сигналы перегруза снижают риск провалов по карточкам и SLA ответов."
  },
  {
    id: "insurance-backoffice-ops",
    industry_key: "insurance_ops",
    segment_name: "Операционные блоки страховых (урегулирование/поддержка)",
    niche: "back-office и сервис клиентов",
    pain_trigger: "высокая нагрузка по кейсам и повторяющиеся стрессовые сценарии",
    source_pack: "finance_insurance",
    match_terms: ["страх", "урегулирован", "back-office", "support"],
    priority: 84,
    hrd_hook: "Pulse-сигналы помогают удерживать экспертов урегулирования в периоды пиковых выплат.",
    coo_hook: "Операционная команда быстрее гасит очереди кейсов при ранней диагностике перегруза."
  },
  {
    id: "outsourced-sales-agencies",
    industry_key: "outsourced_sales",
    segment_name: "Агентства аутсорс-продаж и телемаркетинга",
    niche: "команды массовых исходящих коммуникаций",
    pain_trigger: "эмоциональное выгорание и нестабильная производительность операторов",
    source_pack: "contact_centers",
    match_terms: ["аутсорс", "телемаркетинг", "продаж", "оператор"],
    priority: 83,
    hrd_hook: "Для HR это быстрый способ снизить churn в агрессивной воронке продаж.",
    coo_hook: "Стабильность смен и воронки растёт, когда видно реальное состояние команды."
  },
  {
    id: "regional-distribution-centers",
    industry_key: "distribution",
    segment_name: "Региональные распределительные центры",
    niche: "центры снабжения розницы/производства",
    pain_trigger: "пиковая загрузка смен и рост ошибок комплектования",
    source_pack: "logistics_3pl",
    match_terms: ["распределит", "рц", "склад", "логист"],
    priority: 82,
    hrd_hook: "Pulse помогает заранее увидеть «красные» смены и удержать ядро складских команд.",
    coo_hook: "Это снижает риск отгрузочных ошибок и операционных простоев в РЦ."
  },
  {
    id: "food-production-lines",
    industry_key: "food_manufacturing",
    segment_name: "Пищевые производства с непрерывной линией",
    niche: "FMCG и food tech operations",
    pain_trigger: "жёсткий темп и монотонные смены повышают риск потерь персонала",
    source_pack: "manufacturing",
    match_terms: ["пищев", "fmcg", "линия", "производство", "смен"],
    priority: 81,
    hrd_hook: "Снижение attrition в линиях начинается с короткого цикла обратной связи по сменам.",
    coo_hook: "Операционные потери и брак падают, когда стресс-индикаторы видны ежедневно."
  },
  {
    id: "hotel-networks",
    industry_key: "hotel",
    segment_name: "Сети отелей и апарт-отелей",
    niche: "гостиничный сервис",
    pain_trigger: "сезонная волатильность загрузки и перегруз фронт-деска",
    source_pack: "retail_horeca",
    match_terms: ["отел", "гостин", "front desk", "сезон"],
    priority: 80,
    hrd_hook: "Pulse фиксирует перегруз фронт-офиса до скачка текучки в сезон.",
    coo_hook: "Для операций это способ сохранить качество сервиса при волатильной загрузке."
  },
  {
    id: "customs-brokers-ops",
    industry_key: "customs",
    segment_name: "Таможенные брокеры и ВЭД-операции",
    niche: "документооборот и клиентский сервис ВЭД",
    pain_trigger: "стресс из-за дедлайнов по оформлению и ошибок в документах",
    source_pack: "transport_fleet",
    match_terms: ["вэд", "тамож", "брокер", "документ"],
    priority: 79,
    hrd_hook: "Регулярный pulse уменьшает риск выгорания специалистов в дедлайновых циклах ВЭД.",
    coo_hook: "Снижение ошибок по документам начинается с контроля перегруза команды."
  },
  {
    id: "municipal-service-contractors",
    industry_key: "municipal",
    segment_name: "Подрядчики городских сервисов (уборка, обслуживание, благоустройство)",
    niche: "муниципальные контракты и полевые бригады",
    pain_trigger: "высокая ротация линейного персонала и контроль качества по районам",
    source_pack: "facility_security",
    match_terms: ["муницип", "городск", "подряд", "бригад"],
    priority: 78,
    hrd_hook: "Pulse по районам помогает удерживать линейные бригады и снижать текучку.",
    coo_hook: "Операционная дисциплина по контрактам растёт при ранней диагностике перегрузки."
  },
  {
    id: "regional-bank-branches",
    industry_key: "regional_banks",
    segment_name: "Сети региональных отделений банков",
    niche: "фронт-офис и операционные окна",
    pain_trigger: "неравномерная нагрузка отделений и выгорание фронт-персонала",
    source_pack: "finance_insurance",
    match_terms: ["отделен", "банк", "фронт", "окно", "регион"],
    priority: 82,
    hrd_hook: "Pulse даёт HR картину по отделениям и снижает внезапные кадровые провалы.",
    coo_hook: "Управляйте очередями и сервисом через ранние сигналы перегруза по филиалам."
  },
  {
    id: "warehouse-marketplace-return-centers",
    industry_key: "returns",
    segment_name: "Центры обработки возвратов маркетплейсов",
    niche: "reverse logistics",
    pain_trigger: "всплески возвратов приводят к хаосу смен и ошибкам маршрутизации",
    source_pack: "logistics_3pl",
    match_terms: ["возврат", "reverse logistics", "маркетплейс", "склад"],
    priority: 83,
    hrd_hook: "В циклах возвратов pulse снижает риск выгорания складских и QA-команд.",
    coo_hook: "Стабилизация возвратного потока начинается с контроля перегрузки смен."
  },
  {
    id: "field-service-maintenance",
    industry_key: "field_service",
    segment_name: "Выездные сервисные службы и техобслуживание",
    niche: "полевые инженеры и диспетчеризация",
    pain_trigger: "плотные маршруты и эмоционально тяжёлые клиентские кейсы",
    source_pack: "transport_fleet",
    match_terms: ["выезд", "сервис", "инженер", "диспетчер", "маршрут"],
    priority: 80,
    hrd_hook: "Pulse-сигналы помогают удерживать полевые команды и снижать утомление в маршрутах.",
    coo_hook: "Это даёт более предсказуемое исполнение заявок и меньше повторных выездов."
  }
];

const SOURCE_PACKS_EN = {
  default: [
    { name: "LinkedIn company directory", type: "directory", where: "filter by industry and headcount" },
    { name: "Indeed employer pages", type: "jobs directory", where: "filter by business unit and locations" },
    { name: "Google Maps categories", type: "maps catalog", where: "collect companies by category and city" },
    { name: "Industry association member lists", type: "associations", where: "use public member directories" }
  ]
};

const SEGMENT_CATALOG_EN = [
  {
    id: "bpo-contact-centers-en",
    industry_key: "bpo",
    segment_name: "BPO contact centers",
    niche: "outsourced customer operations",
    pain_trigger: "high attrition and strict SLA pressure in frontline teams",
    source_pack: "default",
    match_terms: ["bpo", "contact center", "sla", "support", "attrition"],
    priority: 94,
    hrd_hook: "Pulse feedback helps cut frontline attrition before it impacts hiring and onboarding cost.",
    coo_hook: "Early burnout signals protect SLA stability before queue performance drops."
  },
  {
    id: "clinic-networks-en",
    industry_key: "healthcare",
    segment_name: "Clinic networks (10+ branches)",
    niche: "multi-branch healthcare operations",
    pain_trigger: "uneven staff load and service quality across branches",
    source_pack: "default",
    match_terms: ["clinic", "healthcare", "branch", "patient services"],
    priority: 92,
    hrd_hook: "Pulse data surfaces branch-level retention risks before frontline churn spikes.",
    coo_hook: "Branch stress visibility helps standardize service quality across locations."
  },
  {
    id: "3pl-warehouses-en",
    industry_key: "logistics",
    segment_name: "3PL warehouses",
    niche: "shift-based logistics operations",
    pain_trigger: "peak load creates recurring team fatigue and fulfillment errors",
    source_pack: "default",
    match_terms: ["3pl", "warehouse", "fulfillment", "shift"],
    priority: 91,
    hrd_hook: "Pulse cycles reduce sudden frontline attrition in shift-heavy logistics teams.",
    coo_hook: "Operational incidents decline when overload signals are visible ahead of SLA misses."
  },
  {
    id: "courier-services-en",
    industry_key: "courier",
    segment_name: "Courier and last-mile services",
    niche: "delivery operations",
    pain_trigger: "volatile workload and rising customer complaint pressure",
    source_pack: "default",
    match_terms: ["courier", "delivery", "last mile", "fleet"],
    priority: 90,
    hrd_hook: "Short pulse checks support retention in high-turnover courier teams.",
    coo_hook: "Better stress visibility improves route consistency and delivery quality."
  },
  {
    id: "manufacturing-247-en",
    industry_key: "manufacturing",
    segment_name: "24/7 manufacturing plants",
    niche: "continuous production operations",
    pain_trigger: "night shift fatigue raises quality and safety risks",
    source_pack: "default",
    match_terms: ["manufacturing", "24/7", "shift", "plant"],
    priority: 89,
    hrd_hook: "Pulse signals catch shift fatigue early and reduce avoidable turnover.",
    coo_hook: "Lower quality incidents by identifying overloaded shifts before they fail."
  },
  {
    id: "retail-chains-en",
    industry_key: "retail",
    segment_name: "Retail chains (50+ stores)",
    niche: "distributed store operations",
    pain_trigger: "service inconsistency and branch-level attrition",
    source_pack: "default",
    match_terms: ["retail", "store", "chain", "operations"],
    priority: 88,
    hrd_hook: "Pulse by region helps HR prioritize retention interventions by store cluster.",
    coo_hook: "Store-level stress trends explain service dips before customer metrics collapse."
  },
  {
    id: "facility-security-en",
    industry_key: "facility",
    segment_name: "Facility and security service networks",
    niche: "distributed field staff operations",
    pain_trigger: "low visibility into team state across multiple sites",
    source_pack: "default",
    match_terms: ["facility", "security", "field teams", "sites"],
    priority: 87,
    hrd_hook: "Anonymous pulse data reduces hidden attrition risk in distributed field teams.",
    coo_hook: "Site-level early warnings help prevent client-facing service failures."
  },
  {
    id: "it-service-desks-en",
    industry_key: "it_services",
    segment_name: "IT service desks (24/7)",
    niche: "managed support operations",
    pain_trigger: "incident peaks overload L1/L2 teams and degrade response quality",
    source_pack: "default",
    match_terms: ["service desk", "it support", "incident", "msp"],
    priority: 86,
    hrd_hook: "Pulse helps retain high-value support specialists under continuous incident load.",
    coo_hook: "Queue stability improves when stress hotspots are visible across shifts."
  },
  {
    id: "transport-fleets-en",
    industry_key: "transport",
    segment_name: "Transport fleet operators",
    niche: "dispatch and route-heavy operations",
    pain_trigger: "dispatch pressure and route variability increase churn risk",
    source_pack: "default",
    match_terms: ["transport", "fleet", "dispatch", "route"],
    priority: 85,
    hrd_hook: "Pulse monitoring helps retain dispatch and driver teams in high-stress schedules.",
    coo_hook: "Early overload detection supports route reliability and schedule adherence."
  },
  {
    id: "education-networks-en",
    industry_key: "education",
    segment_name: "Multi-campus education networks",
    niche: "distributed academic and admin teams",
    pain_trigger: "fragmented communication and weak team sentiment visibility",
    source_pack: "default",
    match_terms: ["education", "campus", "academic operations"],
    priority: 84,
    hrd_hook: "Pulse cadence improves retention and engagement across multi-campus teams.",
    coo_hook: "Operational consistency grows when team risk signals are visible by campus."
  }
];

const normalizeSegmentKey = (value) =>
  normalizePhrase(value, 160)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const SEGMENT_SIZE_RANGE_HINTS = {
  bpo: [120, 900],
  finserv: [200, 1500],
  healthcare: [80, 700],
  logistics: [120, 1200],
  courier: [80, 800],
  manufacturing: [200, 1500],
  retail: [150, 1200],
  horeca: [50, 350],
  transport: [100, 900],
  facility: [120, 1000],
  it_services: [80, 700],
  saas: [60, 500],
  pharma: [250, 1800],
  diagnostics: [100, 900],
  telecom: [250, 2000],
  franchise: [80, 700],
  aviation_ops: [120, 900],
  construction: [120, 1200],
  energy: [180, 1500],
  public_services: [80, 800],
  insurance_ops: [150, 1200],
  outsourced_sales: [60, 500],
  distribution: [150, 1400],
  food_manufacturing: [120, 1100],
  hotel: [80, 900],
  customs: [50, 350],
  municipal: [120, 1000],
  regional_banks: [300, 2500],
  returns: [120, 1000],
  field_service: [80, 700]
};

const parseSizeBoundsFromText = (value) => {
  const text = normalizeWhitespace(value);
  if (!text) return null;
  const lower = text.toLowerCase();
  const hasSizeContext =
    /(сотруд|человек|штат|headcount|employee|team|команд|размер|size|компан|филиал|точек)/i.test(lower) ||
    /^\d{1,5}\s*(?:[-–—]|to|до)\s*\d{1,5}$/i.test(lower) ||
    /^\d{1,5}\s*\+$/i.test(lower);
  if (!hasSizeContext) return null;

  const explicit =
    lower.match(/от\s*(\d{1,5})\s*до\s*(\d{1,5})/i) ||
    lower.match(/(\d{1,5})\s*(?:[-–—]|to|до)\s*(\d{1,5})/i);
  if (explicit) {
    const first = Number(explicit[1]);
    const second = Number(explicit[2]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return {
        min: Math.max(5, Math.min(first, second)),
        max: Math.min(100000, Math.max(first, second)),
        strict: true
      };
    }
  }

  const plus = lower.match(/(\d{1,5})\s*\+/i);
  if (plus) {
    const min = Number(plus[1]);
    if (Number.isFinite(min)) return { min: Math.max(5, min), max: null, strict: false };
  }

  const minOnly = lower.match(/от\s*(\d{1,5})/i);
  const maxOnly = lower.match(/до\s*(\d{1,5})/i);
  if (minOnly || maxOnly) {
    const min = minOnly ? Number(minOnly[1]) : null;
    const max = maxOnly ? Number(maxOnly[1]) : null;
    return {
      min: Number.isFinite(min) ? Math.max(5, min) : null,
      max: Number.isFinite(max) ? Math.min(100000, max) : null,
      strict: false
    };
  }
  return null;
};

const resolveIntentSizeBounds = (intent) => {
  const values = toStringList(
    [
      ...asArray(intent?.icp?.company_size),
      ...(Array.isArray(intent?.company_size) ? intent.company_size : []),
      ...asArray(intent?.constraints?.must_have),
      intent?.task_text
    ],
    20,
    120
  );
  for (const value of values) {
    const parsed = parseSizeBoundsFromText(value);
    if (parsed) return parsed;
  }
  return null;
};

const resolveSegmentSizeHint = (segment, language) => {
  const key = normalizeSegmentKey(segment?.industry_key || "").replace(/\s+/g, "_");
  const mapped = SEGMENT_SIZE_RANGE_HINTS[key];
  if (Array.isArray(mapped) && mapped.length === 2) return mapped;
  return language === "en" ? [50, 500] : [80, 600];
};

const formatSizeRange = ({ min, max, language, includeSuffix = true }) => {
  if (!Number.isFinite(min) && !Number.isFinite(max)) return language === "ru" ? "80-600 сотрудников" : "80-600 employees";
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return includeSuffix
      ? `${min}-${max}${language === "ru" ? " сотрудников" : " employees"}`
      : `${min}-${max}`;
  }
  if (Number.isFinite(min)) {
    return includeSuffix
      ? `${min}+${language === "ru" ? " сотрудников" : " employees"}`
      : `${min}+`;
  }
  return includeSuffix
    ? `до ${max}${language === "ru" ? " сотрудников" : " employees"}`
    : `<=${max}`;
};

const resolveSegmentSizeProfile = ({ intent, segment, language }) => {
  const [baseMin, baseMax] = resolveSegmentSizeHint(segment, language);
  const userBounds = resolveIntentSizeBounds(intent);
  const baseLabel = formatSizeRange({ min: baseMin, max: baseMax, language });

  if (!userBounds) {
    return {
      size_range: baseLabel,
      size_preferred: baseLabel,
      icp_fit: language === "ru" ? "Подходит" : "Fit",
      why_partial: "",
      how_to_narrow: ""
    };
  }

  const userMin = Number.isFinite(userBounds.min) ? userBounds.min : null;
  const userMax = Number.isFinite(userBounds.max) ? userBounds.max : null;
  const overlapMin = Number.isFinite(userMin) ? Math.max(baseMin, userMin) : baseMin;
  const overlapMax = Number.isFinite(userMax) ? Math.min(baseMax, userMax) : baseMax;
  const hasOverlap = overlapMin <= overlapMax;

  if (!hasOverlap) {
    const requested = formatSizeRange({ min: userMin, max: userMax, language });
    return {
      size_range:
        language === "ru"
          ? `${requested} (рекомендовано ${formatSizeRange({ min: baseMin, max: baseMax, language, includeSuffix: false })})`
          : `${requested} (recommended ${formatSizeRange({ min: baseMin, max: baseMax, language, includeSuffix: false })})`,
      size_preferred: baseLabel,
      icp_fit: language === "ru" ? "Не подходит" : "Not fit",
      why_partial: "",
      how_to_narrow: ""
    };
  }

  const requested = formatSizeRange({ min: userMin, max: userMax, language });
  const preferredCompact = formatSizeRange({
    min: overlapMin,
    max: overlapMax,
    language,
    includeSuffix: false
  });
  const baseInsideRequest =
    (!Number.isFinite(userMin) || userMin <= baseMin) && (!Number.isFinite(userMax) || userMax >= baseMax);
  const icpFit = baseInsideRequest
    ? language === "ru"
      ? "Подходит"
      : "Fit"
    : language === "ru"
      ? "Частично подходит"
      : "Partial fit";

  return {
    size_range:
      language === "ru"
        ? `${requested} (лучше ${preferredCompact})`
        : `${requested} (best ${preferredCompact})`,
    size_preferred: formatSizeRange({ min: overlapMin, max: overlapMax, language }),
    icp_fit: icpFit,
    why_partial:
      icpFit === (language === "ru" ? "Частично подходит" : "Partial fit")
        ? language === "ru"
          ? "Типичный размер сегмента шире заданного ICP-диапазона."
          : "Typical segment size is wider than the requested ICP range."
        : "",
    how_to_narrow:
      icpFit === (language === "ru" ? "Частично подходит" : "Partial fit")
        ? language === "ru"
          ? `Оставьте компании ${preferredCompact} сотрудников и приоритетно филиальные/сменные команды.`
          : `Keep companies in ${preferredCompact} employee range and prioritize distributed/shift teams.`
        : ""
  };
};

const resolveIntentOfferLabel = ({ intent, language }) => {
  const candidates = toStringList(
    [
      ...asArray(intent?.offer?.product_or_service),
      ...asArray(intent?.offer?.keywords),
      ...(Array.isArray(intent?.keywords) ? intent.keywords : [])
    ],
    20,
    120
  );
  for (const candidate of candidates) {
    if (!candidate || /[/.]/.test(candidate)) continue;
    const tokens = tokenizeTerms(candidate);
    if (!Array.isArray(tokens) || tokens.length === 0) continue;
    const phrase = normalizePhrase(tokens.slice(0, 6).join(" "), 80);
    if (!phrase) continue;
    return phrase;
  }
  return language === "ru" ? "решение для команд" : "team solution";
};

const resolveWarmLprRoles = ({ language, context }) => {
  const base = language === "en" ? FIXED_LPR_ROLES_EN : FIXED_LPR_ROLES_RU;
  const lower = normalizeTerm(context || "");
  const picked = [];
  const push = (role) => {
    if (!role) return;
    if (!picked.includes(role)) picked.push(role);
  };

  if (/(hr|people|персонал|вовлеч|engagement|wellbeing|выгор|текуч|enps|опрос)/i.test(lower)) {
    push(base[0]);
    push(base[1]);
    push(base[2]);
  }
  if (/(операц|operation|логист|склад|3pl|сервис|support|колл|shift|смен)/i.test(lower)) {
    push(base[4]);
    push(base[3]);
  }
  if (/(охрана труда|пб|safety|risk|стресс)/i.test(lower)) {
    push(base[5]);
  }
  if (/(коммуникац|communication|employer brand|корпоратив)/i.test(lower)) {
    push(base[6]);
  }
  if (/(тендер|закуп|procurement|rfp|бюджет|cost|pricing)/i.test(lower)) {
    push(base[7]);
  }

  base.forEach((role) => push(role));
  if (picked.length < 2) {
    base.forEach((role) => push(role));
  }
  return picked.slice(0, 4);
};

const FALLBACK_SOURCE_PACK_RU = [
  { name: "HH работодатели", type: "jobs directory", where: "hh.ru/employers + фильтры по отрасли и региону" },
  { name: "2ГИС категории бизнеса", type: "catalog", where: "2gis.ru: рубрики по городам и карточки компаний" },
  { name: "Rusprofile по ОКВЭД", type: "legal entities", where: "rusprofile.ru + ОКВЭД и регион" },
  { name: "Отраслевые реестры/ассоциации РФ", type: "associations", where: "публичные списки участников и членов" },
  { name: "RAEX / РБК Компании / VC.ru подборки", type: "rankings", where: "рейтинги и подборки компаний по сегментам" }
];

const FALLBACK_SOURCE_PACK_EN = [
  { name: "LinkedIn company directory", type: "directory", where: "filter by industry, headcount and location" },
  { name: "Indeed employer pages", type: "jobs directory", where: "filter by role clusters and regions" },
  { name: "Google Maps categories", type: "maps catalog", where: "collect companies by category and city" },
  { name: "Industry associations", type: "associations", where: "public member lists and partner directories" }
];

const UNIVERSAL_SOURCES_RU_CIS = [
  { name: "HH работодатели", type: "jobs directory", where: "hh.ru/employers: отрасль, регион, размер компании" },
  { name: "2ГИС", type: "catalog", where: "2gis.ru: рубрики, карточки компаний, сайты и контакты" },
  { name: "Rusprofile (ОКВЭД)", type: "legal entities", where: "rusprofile.ru: выборка компаний по ОКВЭД и региону" }
];

const UNIVERSAL_SOURCES_RU_GLOBAL = [
  ...UNIVERSAL_SOURCES_RU_CIS,
  { name: "Clutch/GoodFirms", type: "global directories", where: "использовать только в режиме «Глобально»" }
];

const UNIVERSAL_SOURCES_EN = [
  { name: "LinkedIn company directory", type: "directory", where: "filter by headcount, location and industry" },
  { name: "Google Maps categories", type: "maps catalog", where: "collect company pages by category and city" },
  { name: "Official registries / associations", type: "associations", where: "public member lists and registries" }
];

const getSegmentCatalog = (language) => (language === "en" ? SEGMENT_CATALOG_EN : SEGMENT_CATALOG_RU);
const getSourcePackMap = (language) => (language === "en" ? SOURCE_PACKS_EN : SOURCE_PACKS_RU);

const resolveSourcePackEntries = ({ language, sourcePack, geoScope = "cis" }) => {
  const sourceMap = getSourcePackMap(language);
  const fallback = language === "en" ? FALLBACK_SOURCE_PACK_EN : FALLBACK_SOURCE_PACK_RU;
  const globalMode = String(geoScope || "cis").toLowerCase() === "global";
  const primary = Array.isArray(sourceMap?.[sourcePack]) ? sourceMap[sourcePack] : [];
  const merged = [...primary, ...fallback];
  const unique = [];
  const seen = new Set();
  merged.forEach((item) => {
    if (!item || typeof item !== "object") return;
    if (item.global_only && !globalMode) return;
    const name = normalizePhrase(item.name, 160);
    const type = normalizePhrase(item.type, 80);
    const where = normalizePhrase(item.where, 220);
    if (!globalMode && /(clutch|goodfirms)/i.test(`${name} ${where}`)) return;
    const key = normalizeSegmentKey(name);
    if (!name || !key || seen.has(key)) return;
    seen.add(key);
    unique.push({ name, type, where });
  });
  return unique.slice(0, 6);
};

const resolveUniversalSources = ({ language, geoScope }) => {
  const globalMode = String(geoScope || "cis").toLowerCase() === "global";
  const base =
    language === "en"
      ? UNIVERSAL_SOURCES_EN
      : globalMode
        ? UNIVERSAL_SOURCES_RU_GLOBAL
        : UNIVERSAL_SOURCES_RU_CIS;
  const unique = [];
  const seen = new Set();
  base.forEach((item) => {
    const name = normalizePhrase(item?.name, 160);
    const type = normalizePhrase(item?.type, 80);
    const where = normalizePhrase(item?.where, 220);
    const key = normalizeSegmentKey(name);
    if (!name || !key || seen.has(key)) return;
    seen.add(key);
    unique.push({ name, type, where });
  });
  return unique.slice(0, 6);
};

const buildSourceQuickCollectHint = ({ source, language }) => {
  const name = normalizeTerm(source?.name || "");
  const where = normalizeTerm(source?.where || "");
  const merged = `${name} ${where}`;
  if (language === "ru") {
    if (/hh|employers/.test(merged)) {
      return "HH employers → фильтр отрасль+регион → копируйте 30 карточек работодателей.";
    }
    if (/2гис|2gis/.test(merged)) {
      return "2ГИС → выберите рубрику и город → откройте карточки и заберите сайт/название.";
    }
    if (/rusprofile|оквэд/.test(merged)) {
      return "Rusprofile → выберите ОКВЭД+регион → соберите названия и сайты из карточек.";
    }
    if (/яндекс карты|yandex.*maps|maps catalog/.test(merged)) {
      return "Карты → рубрика + город → берите компании с активным сайтом/контактами.";
    }
    if (/raex|рбк|vc/.test(merged)) {
      return "Рейтинг/подборка → откройте топ-лист → перенесите компании в таблицу.";
    }
    if (/ассоциац|реестр|registry/.test(merged)) {
      return "Реестр/ассоциация → список участников → копируйте компанию + сайт.";
    }
    if (/каталог|directory/.test(merged)) {
      return "Каталог → фильтр по сегменту → копируйте 20-30 карточек за проход.";
    }
    return "Откройте источник → отфильтруйте по сегменту/региону → скопируйте первые 30 компаний.";
  }
  if (/linkedin/.test(merged)) {
    return "LinkedIn companies → set industry+location filters → copy first 30 company pages.";
  }
  if (/google maps/.test(merged)) {
    return "Google Maps category → set city → open cards and copy name+site.";
  }
  if (/indeed/.test(merged)) {
    return "Indeed employers → filter by category+region → copy employer pages.";
  }
  return "Open source → filter by segment/location → copy first 30 company entries.";
};

const buildCatalogIntentTokenSet = ({ intent, offerName }) => {
  const terms = toStringList(
    [
      offerName,
      ...asArray(intent?.offer?.product_or_service),
      ...asArray(intent?.offer?.keywords),
      ...asArray(intent?.offer?.synonyms),
      ...asArray(intent?.icp?.industries),
      ...asArray(intent?.industries),
      ...asArray(intent?.icp?.roles),
      ...asArray(intent?.roles),
      ...asArray(intent?.target_customer),
      intent?.task_text
    ],
    90,
    160
  );
  const tokens = new Set();
  terms.forEach((term) => {
    tokenizeTerms(term).forEach((token) => {
      const normalized = normalizeTerm(token || "");
      if (!normalized || normalized.length < 2) return;
      tokens.add(normalized);
    });
  });
  return tokens;
};

const buildIntentIndustryHints = ({ intent }) => {
  const hints = new Set();
  toStringList([...(asArray(intent?.icp?.industries) || []), ...(asArray(intent?.industries) || [])], 30, 80).forEach(
    (item) => {
      const key = normalizeSegmentKey(item);
      if (key) hints.add(key);
    }
  );
  return hints;
};

const scoreCatalogSegment = ({ segment, intentTokens, industryHints }) => {
  const basePriority = Number.isFinite(Number(segment?.priority)) ? Number(segment.priority) : 70;
  const segmentText = normalizeTerm(`${segment?.segment_name || ""} ${segment?.niche || ""}`);
  const matchTerms = toStringList(segment?.match_terms || [], 20, 50).map((item) => normalizeTerm(item));

  let termHits = 0;
  matchTerms.forEach((term) => {
    if (!term) return;
    if (intentTokens.has(term)) {
      termHits += 1;
      return;
    }
    const fuzzy = [...intentTokens].some((token) => token.includes(term) || term.includes(token));
    if (fuzzy) termHits += 0.6;
  });

  let semanticHits = 0;
  [...intentTokens].slice(0, 40).forEach((token) => {
    if (token.length < 3) return;
    if (segmentText.includes(token)) semanticHits += 1;
  });

  const industryKey = normalizeSegmentKey(segment?.industry_key || "");
  const hasIndustryMatch = industryKey && industryHints.has(industryKey);
  const scoreRaw =
    basePriority + Math.min(4, termHits) * 3 + Math.min(5, semanticHits) * 1.6 + (hasIndustryMatch ? 8 : 0);
  const score = Math.max(60, Math.min(98, Math.round(scoreRaw)));
  return score;
};

const rankCatalogSegments = ({ intent, language }) => {
  const offerName = resolveIntentOfferLabel({ intent, language });
  const intentTokens = buildCatalogIntentTokenSet({ intent, offerName });
  const industryHints = buildIntentIndustryHints({ intent });
  const catalog = getSegmentCatalog(language);
  return catalog
    .map((segment) => ({
      segment,
      score: scoreCatalogSegment({ segment, intentTokens, industryHints })
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(b.segment?.priority || 0) - Number(a.segment?.priority || 0);
    });
};

const buildWarmWhereToContact = ({ segment, language, geoScope }) => {
  const entries = resolveSourcePackEntries({ language, sourcePack: segment?.source_pack, geoScope });
  if (!entries.length) {
    return language === "ru"
      ? "Сайт компании, раздел контактов, вакансии, тендерные площадки."
      : "Company site, contact pages, jobs and procurement portals.";
  }
  const summary = entries
    .slice(0, 3)
    .map((item) => item.name)
    .filter(Boolean)
    .join(", ");
  return normalizePhrase(summary, 220);
};

const makeWarmTargetFromSegment = ({ segment, score, intent, language, offerName, geoScope }) => {
  const segmentName = normalizePhrase(segment?.segment_name, 160);
  const niche = normalizePhrase(segment?.niche || segmentName, 160);
  const pain = normalizePhrase(segment?.pain_trigger, 220);
  const sizeProfile = resolveSegmentSizeProfile({ intent, segment, language });
  const roles = resolveWarmLprRoles({
    language,
    context: `${segmentName} ${niche} ${pain} ${offerName}`
  });
  return {
    segment_id: normalizePhrase(segment?.id, 80),
    industry_key: normalizePhrase(segment?.industry_key, 80),
    source_pack: normalizePhrase(segment?.source_pack, 80),
    company_type: segmentName || niche || "—",
    niche,
    pain_trigger: pain,
    why_need: `${offerName}: ${pain}.`,
    size_range: sizeProfile.size_range,
    size_preferred: sizeProfile.size_preferred,
    icp_fit: sizeProfile.icp_fit,
    why_partial: sizeProfile.why_partial,
    how_to_narrow: sizeProfile.how_to_narrow,
    lpr_roles: roles.slice(0, 4),
    hrd_hook: normalizePhrase(segment?.hrd_hook, 260),
    coo_hook: normalizePhrase(segment?.coo_hook, 260),
    where_to_find_contacts: buildWarmWhereToContact({ segment, language, geoScope }),
    confidence: Math.max(65, Math.min(96, Number.isFinite(Number(score)) ? Number(score) : 75))
  };
};

const buildTopBestSegments = ({ intent, language, rankedSegments, geoScope, limit = 10 }) => {
  const offerName = resolveIntentOfferLabel({ intent, language });
  const rows = [];
  const seenIndustry = new Set();
  const seenSegment = new Set();

  rankedSegments.forEach(({ segment, score }) => {
    if (rows.length >= limit) return;
    const industryKey = normalizeSegmentKey(segment?.industry_key || segment?.segment_name || "");
    const segmentKey = normalizeSegmentKey(segment?.segment_name || segment?.id || "");
    if (!segmentKey || seenSegment.has(segmentKey)) return;
    if (industryKey && seenIndustry.has(industryKey)) return;
    const row = makeWarmTargetFromSegment({ segment, score, intent, language, offerName, geoScope });
    seenSegment.add(segmentKey);
    if (industryKey) seenIndustry.add(industryKey);
    rows.push({
      rank: rows.length + 1,
      ...row
    });
  });

  if (rows.length < limit) {
    rankedSegments.forEach(({ segment, score }) => {
      if (rows.length >= limit) return;
      const segmentKey = normalizeSegmentKey(segment?.segment_name || segment?.id || "");
      if (!segmentKey || seenSegment.has(segmentKey)) return;
      const row = makeWarmTargetFromSegment({ segment, score, intent, language, offerName, geoScope });
      seenSegment.add(segmentKey);
      rows.push({
        rank: rows.length + 1,
        ...row
      });
    });
  }

  return rows.slice(0, limit);
};

const buildWhereToGetCompanyLists = ({ topSegments, language, geoScope }) => {
  const universalSources = resolveUniversalSources({ language, geoScope }).map((source) => ({
    ...source,
    quick_collect_3min: buildSourceQuickCollectHint({ source, language })
  }));
  const universalKeys = new Set(universalSources.map((item) => normalizeSegmentKey(item?.name)));
  const segmentRows = (Array.isArray(topSegments) ? topSegments : []).map((segmentItem) => {
    const sourcePackRows = resolveSourcePackEntries({
      language,
      sourcePack: segmentItem?.source_pack,
      geoScope
    });
    const specific = sourcePackRows.filter(
      (source) => !universalKeys.has(normalizeSegmentKey(source?.name || ""))
    );
    const selected = [...specific, ...sourcePackRows]
      .filter((source, index, arr) => {
        const key = normalizeSegmentKey(source?.name || "");
        return key && arr.findIndex((item) => normalizeSegmentKey(item?.name || "") === key) === index;
      })
      .slice(0, 4);
    const minRows = selected.length >= 2 ? selected : sourcePackRows.slice(0, 2);
    return {
      segment: normalizePhrase(segmentItem?.company_type || segmentItem?.niche || "segment", 180),
      industry_key: normalizePhrase(segmentItem?.industry_key, 80),
      sources: minRows.slice(0, 4).map((source) => ({
        name: normalizePhrase(source?.name, 180),
        type: normalizePhrase(source?.type, 80),
        where: normalizePhrase(source?.where, 240),
        quick_collect_3min: buildSourceQuickCollectHint({ source, language })
      })),
      sourcing_tip:
        language === "ru"
          ? "Соберите 30-50 компаний. Домен желателен, но можно и без него: Артём поставит NEED_DOMAIN и подскажет, где добрать."
          : "Collect 30-50 companies. Domain is preferred; without it Artem will mark NEED_DOMAIN and suggest where to fetch it."
    };
  });

  return {
    universal_sources: universalSources,
    segments: segmentRows
  };
};

const buildPasteListToRankTemplate = ({ language, geoScope }) =>
  language === "ru"
    ? {
        mode: "RANK_PROVIDED_LIST",
        title: "Paste list to rank",
        expected_items: "30-200",
        instruction:
          "Вставьте 30-200 строк. Артём строго распарсит формат, проставит Hot/Warm, contact hints и outreach.",
        recommended_format: "Company | domain(optional) | city(optional) | source(optional)",
        accepted_formats: ["https://domain.com/path", "Company name only"],
        sample_input: [
          "ООО Пример Логистик | primer-logistics.ru | Москва | hh.ru",
          "https://hh.ru/employer/123456",
          "Сеть клиник Альфа"
        ],
        domain_guidance:
          String(geoScope || "cis").toLowerCase() === "global"
            ? NEED_DOMAIN_SOURCES_EN
            : NEED_DOMAIN_SOURCES_RU,
        missing_domain_status: "NEED_DOMAIN"
      }
    : {
        mode: "RANK_PROVIDED_LIST",
        title: "Paste list to rank",
        expected_items: "30-200",
        instruction:
          "Paste 30-200 rows. Artem will parse strict formats and score Hot/Warm with contact hints.",
        recommended_format: "Company | domain(optional) | city(optional) | source(optional)",
        accepted_formats: ["https://domain.com/contact", "Company name only"],
        sample_input: [
          "Acme Logistics | acme-logistics.com | New York | linkedin",
          "https://www.linkedin.com/company/acme",
          "North Clinic Network"
        ],
        domain_guidance: NEED_DOMAIN_SOURCES_EN,
        missing_domain_status: "NEED_DOMAIN"
      };

const buildAcquisitionPlaybook = ({ topSegments, language, geoScope }) => {
  const globalMode = String(geoScope || "cis").toLowerCase() === "global";
  const first = normalizePhrase(topSegments?.[0]?.company_type, 120);
  const second = normalizePhrase(topSegments?.[1]?.company_type, 120);
  const third = normalizePhrase(topSegments?.[2]?.company_type, 120);
  if (language === "ru") {
    if (globalMode) {
      return [
        {
          step: 1,
          title: "Выберите 3 сегмента и источники",
          action: `Top сегменты: ${[first, second, third].filter(Boolean).join(", ") || "Top 3"}. Используйте LinkedIn company pages и отраслевые каталоги.`,
          timebox: "10 минут"
        },
        {
          step: 2,
          title: "Соберите 100 компаний",
          action: "Снимите названия, домены, город и источник. Без домена помечайте NEED_DOMAIN.",
          timebox: "10 минут"
        },
        {
          step: 3,
          title: "Загрузите в RANK_PROVIDED_LIST",
          action: "Вставьте список и получите Top 10 приоритетных компаний + короткие outreach hooks.",
          timebox: "10 минут"
        }
      ];
    }
    return [
      {
        step: 1,
        title: "HH employers: собрать работодателей по отрасли/региону",
        action: `Возьмите сегменты: ${[first, second, third].filter(Boolean).join(", ") || "Top 3"}. В hh.ru/employers отфильтруйте отрасль/регион и скопируйте карточки 40 компаний.`,
        timebox: "8 минут"
      },
      {
        step: 2,
        title: "2ГИС: добрать компании по рубрике",
        action: "В 2gis.ru откройте рубрику по сегменту, добавьте ещё 30-40 карточек с сайтом/городом.",
        timebox: "8 минут"
      },
      {
        step: 3,
        title: "Rusprofile: добрать по ОКВЭД и проверить дубли",
        action: "В rusprofile.ru выберите ОКВЭД сегмента и добавьте 20-30 компаний. Удалите дубли по названию и домену.",
        timebox: "7 минут"
      },
      {
        step: 4,
        title: "Вставьте список в ранжирование",
        action:
          "Вставьте список в Артёма (RANK_PROVIDED_LIST). Можно без доменов: строки получат статус NEED_DOMAIN и подсказки, где взять домен.",
        timebox: "7 минут"
      }
    ];
  }
  return [
    {
      step: 1,
      title: "Pick 3 segments and export lists",
      action: `Use segments: ${[first, second, third].filter(Boolean).join(", ") || "Top 3"} and collect 30-40 companies per segment from directories/associations/rankings.`,
      timebox: "10 minutes"
    },
    {
      step: 2,
      title: "Clean and enrich",
      action:
        "Deduplicate, add domain, city and source. Keep companies in the 20-1000 employee range with clear operational pain.",
      timebox: "10 minutes"
    },
    {
      step: 3,
      title: "Paste 100 companies to rank",
      action:
        "Paste the list into Artem (RANK_PROVIDED_LIST), get Top 10 prioritized accounts and one-line outreach hooks. Missing domains will be marked as NEED_DOMAIN.",
      timebox: "10 minutes"
    }
  ];
};

const buildWarmTargetCatalog = ({ intent, geoScope, min = 25, max = 30 }) => {
  const language = String(intent?.language || "mixed").toLowerCase() === "en" ? "en" : "ru";
  const offerName = resolveIntentOfferLabel({ intent, language });
  const rankedSegments = rankCatalogSegments({ intent, language });
  const rows = [];
  const seenCompanyType = new Set();
  const perIndustry = new Map();
  let lastIndustry = "";

  const pushWarmRow = ({ segment, score, strict = true }) => {
    if (!segment || rows.length >= max) return;
    const row = makeWarmTargetFromSegment({
      segment,
      score,
      intent,
      language,
      offerName,
      geoScope
    });
    const typeKey = normalizeSegmentKey(row.company_type);
    if (!typeKey || seenCompanyType.has(typeKey)) return;

    const industryKey = normalizeSegmentKey(row.industry_key || row.niche || row.company_type);
    const count = perIndustry.get(industryKey) || 0;
    if (strict && count >= 2) return;
    if (strict && lastIndustry && industryKey === lastIndustry && count >= 1) return;

    seenCompanyType.add(typeKey);
    perIndustry.set(industryKey, count + 1);
    lastIndustry = industryKey;
    rows.push(row);
  };

  rankedSegments.forEach(({ segment, score }) => {
    pushWarmRow({ segment, score, strict: true });
  });

  if (rows.length < min) {
    rankedSegments.forEach(({ segment, score }) => {
      if (rows.length >= min || rows.length >= max) return;
      pushWarmRow({ segment, score, strict: false });
    });
  }

  if (rows.length < min) {
    const fallbackSize = resolveSegmentSizeProfile({ intent, segment: null, language });
    const fallbackIndustries = language === "ru" ? DEFAULT_INDUSTRIES_RU : DEFAULT_INDUSTRIES_EN;
    const fallbackPains =
      language === "ru"
        ? [
            "высокая текучка в сменных командах",
            "сезонная нагрузка ломает стабильность сервиса",
            "распределённые команды работают без единой обратной связи",
            "давление KPI и конфликтный клиентский поток"
          ]
        : [
            "high frontline attrition under shift pressure",
            "seasonal load breaks service consistency",
            "distributed teams lack a shared feedback loop",
            "KPI pressure and conflict-heavy customer flow"
          ];
    fallbackIndustries.forEach((industry, index) => {
      if (rows.length >= min || rows.length >= max) return;
      const type = normalizePhrase(
        language === "ru"
          ? `${industry} — операционные подразделения с высокой нагрузкой`
          : `${industry} operational teams under high load`,
        160
      );
      const key = normalizeSegmentKey(type);
      if (!key || seenCompanyType.has(key)) return;
      seenCompanyType.add(key);
      const pain = fallbackPains[index % fallbackPains.length];
      const roles = resolveWarmLprRoles({
        language,
        context: `${type} ${pain} ${offerName}`
      });
      rows.push({
        company_type: type,
        niche: normalizePhrase(industry, 120),
        pain_trigger: normalizePhrase(pain, 220),
        why_need: `${offerName}: ${normalizePhrase(pain, 220)}.`,
        size_range: fallbackSize.size_range,
        size_preferred: fallbackSize.size_preferred,
        icp_fit: fallbackSize.icp_fit,
        why_partial: fallbackSize.why_partial,
        how_to_narrow: fallbackSize.how_to_narrow,
        lpr_roles: roles.slice(0, 4),
        where_to_find_contacts:
          language === "ru"
            ? "Каталоги компаний, страницы работодателей, отраслевые ассоциации."
            : "Company directories, employer pages and industry associations.",
        confidence: Math.max(65, Math.min(88, 74 + index))
      });
    });
  }

  return rows.slice(0, max);
};

const buildManualQueryTerms = ({ intent, language }) => {
  const terms = toStringList(
    [
      resolveIntentOfferLabel({ intent, language }),
      ...asArray(intent?.offer?.product_or_service),
      ...asArray(intent?.offer?.keywords),
      ...(Array.isArray(intent?.keywords) ? intent.keywords : [])
    ],
    20,
    90
  )
    .map((item) => normalizePhrase(item, 72))
    .filter(Boolean)
    .filter((item) => !/[/.]/.test(item))
    .filter((item) => !PROVIDED_LINE_NOISE_REGEX.test(item))
    .filter((item) => !/(контекст диалога|вложения пользователя)/i.test(item))
    .map((item) => tokenizeTerms(item))
    .filter((tokens) => Array.isArray(tokens) && tokens.length > 0)
    .map((tokens) => normalizePhrase(tokens.slice(0, 5).join(" "), 72))
    .filter((item) => item.length >= 4 && item.length <= 72);

  if (terms.length > 0) return terms.slice(0, 4);
  if (language === "ru") {
    return [
      "опрос сотрудников",
      "опрос вовлеченности",
      "eNPS",
      "анонимная обратная связь сотрудников"
    ];
  }
  return [
    "employee pulse survey",
    "employee engagement survey",
    "eNPS platform",
    "anonymous employee feedback"
  ];
};

const buildManualHotHuntingKit = ({ intent }) => {
  const language = String(intent?.language || "mixed").toLowerCase() === "en" ? "en" : "ru";
  const terms = buildManualQueryTerms({ intent, language });
  const primary = terms[0];
  const secondary = terms[1] || terms[0];
  const tertiary = terms[2] || terms[0];
  const allQueries = [];
  const seen = new Set();
  const push = (value) => {
    const safe = normalizePhrase(value, 140);
    if (!safe) return;
    const key = safe.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    allQueries.push(safe);
  };

  if (language === "ru") {
    [
      `${primary} платформа`,
      `${primary} сервис`,
      `${primary} для компаний`,
      `${secondary} платформа`,
      `${secondary} внедрение`,
      `${tertiary} аналитика`,
      "опрос вовлеченности сервис",
      "eNPS платформа",
      "корпоративное благополучие сервис",
      "анонимная обратная связь сотрудников",
      `ищем платформу ${primary}`,
      `нужно решение ${secondary}`,
      `выбираем сервис ${primary}`,
      `внедряем ${secondary} в компании`,
      `тендер ${primary} платформа`,
      `закупка ${primary} сервис`,
      `вакансия people analytics ${primary}`,
      `site:hh.ru ${primary} внедрение`,
      `site:superjob.ru ${primary} внедрение`,
      `site:zakupki.gov.ru ${primary}`,
      `site:b2b-center.ru ${primary}`,
      `site:vk.com/wall ${primary} "ищем"`,
      `site:t.me/s ${primary} "нужно"`,
      `site:vk.com/wall ${secondary} "выбираем"`
    ].forEach(push);
  } else {
    [
      `${primary} platform`,
      `${primary} service`,
      `${primary} for companies`,
      `${secondary} platform`,
      `${secondary} implementation`,
      `${tertiary} analytics`,
      "employee engagement survey platform",
      "anonymous employee feedback tool",
      `looking for ${primary} platform`,
      `need ${secondary} service`,
      `selecting ${primary} software`,
      `RFP ${primary} platform`,
      `procurement ${primary} solution`,
      `job people analytics implementation ${primary}`,
      `site:linkedin.com/jobs ${primary} implementation`,
      `site:indeed.com ${primary} implementation`,
      `site:x.com "${primary}" "need"`
    ].forEach(push);
  }

  const shortQueries = allQueries.slice(0, language === "ru" ? 22 : 20);
  const vkQueries = shortQueries.filter((query) => /site:vk\.com/i.test(query)).slice(0, 10);
  const telegramQueries = shortQueries.filter((query) => /site:t\.me/i.test(query)).slice(0, 10);
  const commonQueries = shortQueries.filter((query) => !/site:(vk\.com|t\.me)/i.test(query));

  const queryOperators =
    language === "ru"
      ? [
          'site:hh.ru "<ключевое слово>" ("ищем" OR "нужно" OR "выбираем" OR "внедряем")',
          'site:superjob.ru "<ключевое слово>" ("ищем" OR "нужно" OR "внедряем")',
          'site:zakupki.gov.ru "<ключевое слово>" (тендер OR закупка OR "коммерческое предложение")',
          'site:b2b-center.ru "<ключевое слово>" (тендер OR закупка)',
          '"ищем" OR "нужно" OR "выбираем" OR "внедряем" + <ключевое слово>'
        ]
      : [
          'site:linkedin.com/jobs "<keyword>" ("looking for" OR "need" OR "implement")',
          'site:indeed.com "<keyword>" ("looking for" OR "need")',
          '"RFP" OR "tender" OR "procurement" + <keyword>'
        ];

  const sourcePlaybook =
    language === "ru"
      ? [
          { type: "vacancies", where: "hh.ru, superjob.ru", signal: "вакансии с задачами внедрения платформы/процесса" },
          { type: "tenders", where: "zakupki.gov.ru, b2b-center.ru", signal: "тендер/закупка/КП по теме решения" },
          { type: "communities", where: "VK, Telegram, профильные чаты", signal: "посты «ищем/нужно/выбираем»" },
          { type: "company pages", where: "сайт компании, формы «оставить заявку»", signal: "явная боль + контактный канал" }
        ]
      : [
          { type: "vacancies", where: "LinkedIn Jobs, Indeed", signal: "implementation/platform hiring signals" },
          { type: "tenders", where: "public procurement portals", signal: "RFP/tender for relevant solution" },
          { type: "communities", where: "industry communities/channels", signal: "posts like “looking for/need”" },
          { type: "company pages", where: "company contact/request pages", signal: "clear pain + contact path" }
        ];

  const hotChecklist =
    language === "ru"
      ? [
          "Есть триггер намерения: ищем/нужно/выбираем/внедряем/тендер/закупка/вакансия.",
          "Ясно, какую задачу хотят решить (не общий контент).",
          "Есть канал контакта: форма, email, Telegram/VK, телефон.",
          "Источник активный/свежий и связан с компанией/подразделением.",
          "Сегмент совпадает с ICP (гео, размер, операционный контекст)."
        ]
      : [
          "Explicit intent signal: looking for/need/selecting/implementing/tender/procurement/job.",
          "The source contains a concrete problem to solve, not generic content.",
          "A reachable contact channel exists.",
          "The source is recent/active and tied to a real organization.",
          "The target matches ICP (geo, size, operational context)."
        ];

  const negativeExamples =
    language === "ru"
      ? ["что такое", "definition", "dictionary", "zhihu", "quora", "AnyDesk", "remote desktop", "cybersecurity"]
      : ["what is", "definition", "dictionary", "zhihu", "quora", "AnyDesk", "remote desktop", "cybersecurity"];

  return {
    short_queries: shortQueries,
    query_operators: queryOperators,
    queries: {
      google: commonQueries.slice(0, 12),
      yandex: shortQueries.slice(0, 12),
      vk: vkQueries,
      telegram: telegramQueries
    },
    sources: sourcePlaybook,
    hot_signal_checklist: hotChecklist,
    negative_examples: negativeExamples
  };
};

const buildMessageTemplates = ({ language }) => {
  if (language !== "en") {
    return {
      hrd: [
        "Здравствуйте, {company}.",
        "Вижу, что в сегменте {segment} часто болит: {pain}.",
        "Мы закрываем это через короткие pulse-опросы и быстрые сигналы риска по командам.",
        "Могу показать 1-мин демо: {1-min demo link}.",
        "Если актуально, предложу пилот на 7 дней без перестройки процессов."
      ],
      coo: [
        "Здравствуйте, {company}.",
        "Для {segment} риск обычно в том, что {pain} бьёт по SLA и стабильности операций.",
        "Наш подход даёт ранний сигнал по перегрузу команд и снижает операционные срывы.",
        "Вот 1-мин демо: {1-min demo link}.",
        "Готов отправить короткий план внедрения на 2 недели."
      ]
    };
  }
  return {
    hrd: [
      "Hi {company},",
      "In {segment}, teams often struggle with: {pain}.",
      "We solve this via short pulse checks and early risk signals.",
      "Here is a 1-min demo: {1-min demo link}.",
      "If useful, I can share a 7-day pilot plan."
    ],
    coo: [
      "Hi {company},",
      "For {segment}, {pain} usually impacts SLA and operational consistency.",
      "Our approach surfaces overload risks early and helps prevent disruptions.",
      "1-min demo: {1-min demo link}.",
      "I can send a 2-week rollout outline."
    ]
  };
};

const buildOutreachMessages = ({ leads, intent }) => {
  const language = String(intent?.language || "mixed").toLowerCase();
  const offer = normalizePhrase(
    intent?.offer?.product_or_service || intent?.product_or_service?.[0] || "решение",
    120
  );
  return (Array.isArray(leads) ? leads : [])
    .slice(0, 10)
    .map((lead, index) => {
      const who = normalizePhrase(lead?.company_or_organization || lead?.title || `lead-${index + 1}`, 120);
      if (language === "en") {
        return `Hi ${who}, noticed a signal around ${offer}. We can run a 3-5 day pilot to validate fit. Should I send a short implementation plan?`;
      }
      return `Здравствуйте, ${who}. Видим сигнал потребности по теме "${offer}". Можем запустить пилот на 3-5 дней и показать результат. Отправить короткий план внедрения?`;
    });
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const searchTarget = input.search_target === "competitor_scan" ? "competitor_scan" : "buyer_only";
  const webClient = options.webClient;
  const llmProvider = options.llmProvider || getLLMProvider();
  const searchClient =
    options.searchClient && typeof options.searchClient.search === "function"
      ? options.searchClient
      : null;
  const lastData = unwrapLegacy(options.last_run);
  const inputWithLastRun = applyLastRun(input, options.last_run);
  const llmCalls = [];
  let llmUsage = normalizeUsage();
  const intentResult = await parseIntentWithLLM({
    input: inputWithLastRun,
    provider: llmProvider
  });
  llmCalls.push(intentResult.call);
  llmUsage = addUsage(llmUsage, intentResult.usage);

  const planned = buildSearchPlan(inputWithLastRun, intentResult.intent);
  const previousQueries =
    input.mode === "continue" &&
    lastData &&
    lastData.meta &&
    lastData.meta.search_plan &&
    Array.isArray(lastData.meta.search_plan.queries_used)
      ? lastData.meta.search_plan.queries_used
      : null;
  const searchQueries = previousQueries && previousQueries.length ? previousQueries : planned.queries;
  const intent = planned.intent;
  const search_plan = {
    search_target: searchTarget,
    geo_scope: String(intent.geo_scope || input.geo_scope || "cis").toLowerCase(),
    queries_used: searchQueries,
    intent_extraction: {
      task_text: intent.task_text,
      offer: intent.offer,
      icp: intent.icp,
      constraints: intent.constraints,
      buying_signal_lexicon: intent.buying_signal_lexicon,
      negative_lexicon: intent.negative_lexicon,
      flat: {
        product_or_service: intent.product_or_service,
        target_customer: intent.target_customer,
        geo: intent.geo,
        geo_scope: intent.geo_scope,
        company_size: intent.company_size,
        industries: intent.industries,
        roles: intent.roles,
        buying_signals: intent.buying_signals,
        language: intent.language,
        keywords: intent.keywords,
        synonyms_ru_en: intent.synonyms_ru_en,
        negative_keywords: intent.negative_keywords,
        domains: intent.domains
      }
    }
  };

  const providedCandidates = extractProvidedCandidates(inputWithLastRun);
  const providedCandidateCount = providedCandidates.length;
  const requestedWorkflowMode = input.workflow_mode || "auto";
  const runtimeWebSearchEnabled = options.webSearchEnabled !== false;
  const hasSearchClient = Boolean(searchClient && typeof searchClient.search === "function");
  const hasWebClientSearch = Boolean(
    webClient && typeof webClient.search === "function" && options.allowWebClientSearch !== false
  );
  const providerLabel = normalizePhrase(
    options.searchProvider || process.env.SEARCH_PROVIDER || "",
    80
  ).toLowerCase();
  const webSearchEnabled =
    Boolean(input.has_web_access) && runtimeWebSearchEnabled && (hasSearchClient || hasWebClientSearch);
  const effectiveWorkflowMode =
    requestedWorkflowMode === "rank_provided_list"
      ? "rank_provided_list"
      : providedCandidateCount >= 3 && requestedWorkflowMode !== "potential_clients"
        ? "rank_provided_list"
        : requestedWorkflowMode === "auto"
          ? webSearchEnabled
            ? "hot_signals"
            : "potential_clients"
          : requestedWorkflowMode;
  const executeWebSearch =
    webSearchEnabled &&
    effectiveWorkflowMode !== "potential_clients" &&
    effectiveWorkflowMode !== "rank_provided_list";

  if (effectiveWorkflowMode === "rank_provided_list" && providedCandidateCount > 0) {
    const language = String(intent?.language || "mixed").toLowerCase() === "en" ? "en" : "ru";
    const needDomainRecommendations =
      String(intent.geo_scope || input.geo_scope || "cis").toLowerCase() === "global" && language !== "ru"
        ? NEED_DOMAIN_SOURCES_EN
        : language === "ru"
          ? NEED_DOMAIN_SOURCES_RU
          : NEED_DOMAIN_SOURCES_EN;
    const candidatesNeedDomain = providedCandidates.filter(
      (candidate) => String(candidate?.domain_status || "").toUpperCase() === "NEED_DOMAIN"
    ).length;
    const negativeKeywords = buildNegativeKeywordSet({
      candidates: providedCandidates,
      intent,
      searchTarget
    });
    const enrichedProvided = providedCandidates.map((candidate, index) => ({
      ...candidate,
      query: "provided_list",
      query_index: index,
      result_index: index,
      rank: index + 1,
      provider: "provided_list",
      hot_source_allowed: true,
      candidate_id: `p-${index}`,
      page_text: "",
      combined_preview: `${candidate.title || ""} ${candidate.snippet || ""}`.trim(),
      merged_proofs: [
        {
          url: candidate.url || "",
          source_type: candidate.source_kind || "other",
          signal_type: "provided_input",
          signal_value: "user_supplied",
          evidence_snippet: sanitizeEvidenceSnippet(
            `${candidate.title || ""} ${candidate.snippet || ""}`.trim(),
            160
          )
        }
      ]
    }));

    const scoringResult = await scoreCandidatesWithLLM({
      candidates: enrichedProvided,
      intent,
      provider: llmProvider,
      negativeKeywords,
      searchTarget,
      mode: input.mode
    });
    llmUsage = addUsage(llmUsage, scoringResult.usage);
    llmCalls.push(...scoringResult.calls);
    const scoredItems = [...scoringResult.scored.values()];
    const vendorFilteredCount =
      searchTarget !== "competitor_scan"
        ? scoredItems.filter(
            (item) =>
              normalizeEntityRole(item?.entity_role) === "vendor" &&
              String(item?.lead_type || "").toLowerCase() === "drop"
          ).length
        : 0;
    const entityRoleCounts = scoredItems.reduce((acc, item) => {
      const role = normalizeEntityRole(item?.entity_role);
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    const leads = [];
    const dedupeKeys = new Set();

    for (const candidate of enrichedProvided) {
      const score = scoringResult.scored.get(candidate.candidate_id);
      if (!score) continue;
      if (score.lead_type === "Drop" || Number(score.relevance_score || 0) < RELEVANCE_THRESHOLD) {
        continue;
      }
      const entityRole = normalizeEntityRole(score.entity_role);
      if (searchTarget !== "competitor_scan" && entityRole === "vendor") {
        continue;
      }

      const confidence = clampScore(score.relevance_score, 0);
      const sourceKind = candidate.source_kind || "company_page";
      const leadType = String(score.lead_type || "").toLowerCase() === "hot" ? "Hot" : "Warm";

      const companyOrOrganization = extractCompanyOrOrganization({
        title: candidate.title,
        snippet: candidate.snippet,
        url: candidate.url
      });
      const dedupeKey = buildCompositeLeadKey({
        url: candidate.url,
        title: candidate.title,
        fallbackText: `${candidate.title} ${candidate.snippet}`,
        input
      });
      if (dedupeKeys.has(dedupeKey)) continue;
      dedupeKeys.add(dedupeKey);

      const status = String(candidate?.domain_status || "").toUpperCase() === "NEED_DOMAIN" ? "NEED_DOMAIN" : "READY";
      const howToGetDomain = status === "NEED_DOMAIN" ? [...needDomainRecommendations] : [];
      const contactHint = buildRankProvidedContactHint({
        sourceKind,
        url: candidate.url,
        language,
        status,
        needDomainRecommendations
      });
      const nextAction = buildRankProvidedNextAction({
        sourceKind,
        status,
        language
      });

      leads.push({
        title: candidate.title || "Provided candidate",
        source: candidate.source || "provided",
        url: candidate.url || "",
        status,
        how_to_get_domain: howToGetDomain,
        geo_hint: (intent.geo && intent.geo[0]) || input.geo || "",
        request_summary: sanitizeEvidenceSnippet(candidate.snippet || candidate.title || "", 200),
        hot_score: confidence,
        intent_class: classifyIntent(`${candidate.title || ""} ${candidate.snippet || ""}`),
        hot_reasons: [normalizePhrase(score.reason, 180) || "Intent match"],
        reply_angle_options: buildReplyAngleOptions("other", false),
        qualification_question: buildQualificationQuestion("other"),
        suggested_first_contact:
          "Уточните текущий процесс и предложите короткий пилот на 3-5 дней.",
        risk_flags: {
          no_budget_mentioned: !/бюджет|цена|стоимость|pricing|cost/i.test(
            `${candidate.title || ""} ${candidate.snippet || ""}`
          ),
          anonymous_author: false,
          outdated: false,
          privacy_risk: false
        },
        why_match: normalizePhrase(score.reason, 220) || "Совпадение с intent пользователя.",
        why_now: normalizePhrase(score.reason, 220) || "Есть сигнал актуальной задачи.",
        evidence:
          sanitizeEvidenceSnippet(
            score.evidence || candidate.snippet || candidate.title || "",
            180
          ) || "",
        contact_hint: contactHint,
        where_to_contact: contactHint,
        next_action: nextAction,
        confidence,
        is_hot_lead: leadType === "Hot",
        explicit_intent: Boolean(score.has_buying_signal),
        lead_type: leadType,
        entity_role: entityRole,
        recency_hint: "unknown",
        dedupe_key: dedupeKey,
        proof_refs: [],
        company_or_organization: companyOrOrganization || "provided source",
        who: companyOrOrganization || "provided source",
        source_kind: sourceKind,
        source_type: sourceKind,
        search_query: "provided_list",
        search_query_index: candidate.query_index,
        search_result_index: candidate.result_index,
        search_provider: "provided_list",
        search_rank: candidate.rank
      });
    }

    const ranked = leads
      .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
      .slice(0, 10);
    const readyMessages = buildOutreachMessages({
      leads: ranked,
      intent
    });
    const statusCode = "RANK_PROVIDED_LIST";
    const messageTemplates = buildMessageTemplates({ language });
    const output = {
      hot_leads: ranked,
      meta: {
        generated_at: new Date().toISOString(),
        status_code: statusCode,
        search_plan,
        message_templates: messageTemplates,
        rank_provided_list: {
          candidates_from_input: providedCandidateCount,
          candidates_need_domain: candidatesNeedDomain,
          candidates_with_domain: Math.max(0, providedCandidateCount - candidatesNeedDomain),
          need_domain_recommendations: needDomainRecommendations,
          shortlisted: ranked.length,
          ready_messages: readyMessages
        },
        search_debug: {
          geo_scope: String(intent.geo_scope || input.geo_scope || "cis").toLowerCase(),
          search_target: searchTarget,
          searchQueries: searchQueries,
          intent_json: {
            offer: intent.offer || {},
            icp: intent.icp || {},
            constraints: intent.constraints || {},
            buying_signal_lexicon: intent.buying_signal_lexicon || {},
            negative_lexicon: intent.negative_lexicon || {}
          },
          calls: [],
          llm_calls: llmCalls.map((call) => ({
            step: call.step,
            provider: call.provider,
            model: call.model,
            fetched_at: call.fetched_at,
            duration_ms: call.duration_ms,
            status: call.status,
            error: call.error || "",
            prompt_tokens: call.prompt_tokens || 0,
            completion_tokens: call.completion_tokens || 0,
            total_tokens: call.total_tokens || 0,
            items_count: call.items_count || null
          })),
          total_tokens: llmUsage.total_tokens,
          llm_not_called: !llmCalls.some((call) => String(call.status || "").toUpperCase() === "OK"),
          models_per_step: Object.fromEntries(
            llmCalls
              .filter((call) => call && call.step)
              .map((call) => [String(call.step), String(call.model || "unknown")])
          ),
          web_search: {
            enabled: false,
            reason: "rank_provided_list_mode",
            provider: providerLabel || "none"
          },
          candidates_from_input: providedCandidateCount,
          need_domain_count: candidatesNeedDomain,
          need_domain_recommendations: needDomainRecommendations,
          negative_keywords: [...negativeKeywords],
          vendor_filtered_count: vendorFilteredCount,
          geo_drop_count: 0,
          geo_drop_examples: [],
          entity_role_counts: entityRoleCounts
        },
        limitations: [],
        assumptions: [...(Array.isArray(intent.assumptions_applied) ? intent.assumptions_applied : [])],
        quality_checks: {
          no_gray_scraping: true,
          no_fabrication: true,
          dedupe_ok:
            new Set(ranked.map((lead) => String(lead.dedupe_key || ""))).size === ranked.length
        }
      }
    };
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  if (!executeWebSearch) {
    const language = String(intent?.language || "mixed").toLowerCase() === "en" ? "en" : "ru";
    const geoScope = String(intent.geo_scope || input.geo_scope || "cis").toLowerCase();
    const rankedSegments = rankCatalogSegments({ intent, language });
    const topBestSegments = buildTopBestSegments({
      intent,
      language,
      rankedSegments,
      geoScope,
      limit: 10
    });
    const whereToGetCompanyLists = buildWhereToGetCompanyLists({
      topSegments: topBestSegments,
      language,
      geoScope
    });
    const pasteListToRank = buildPasteListToRankTemplate({ language, geoScope });
    const acquisitionPlaybook = buildAcquisitionPlaybook({
      topSegments: topBestSegments,
      language,
      geoScope
    });
    const warmTargets = buildWarmTargetCatalog({ intent, geoScope, min: 25, max: 30 });
    const manualKit = buildManualHotHuntingKit({ intent, queries: searchQueries });
    const messageTemplates = buildMessageTemplates({ language });
    const statusCode = webSearchEnabled ? "POTENTIAL_CLIENTS_ONLY" : "NO_WEB_SEARCH_CONFIGURED";
    const output = {
      hot_leads: [],
      meta: {
        generated_at: new Date().toISOString(),
        status_code: statusCode,
        search_plan,
        message_templates: messageTemplates,
        top_best_segments: topBestSegments,
        universal_sources_for_all_segments: whereToGetCompanyLists.universal_sources,
        where_to_get_company_lists: whereToGetCompanyLists.segments,
        paste_list_to_rank: pasteListToRank,
        how_to_extract_list_fast: acquisitionPlaybook,
        acquisition_playbook: acquisitionPlaybook,
        warm_targets: warmTargets,
        manual_hot_hunting: manualKit,
        limitations: [
          webSearchEnabled
            ? "Режим POTENTIAL_CLIENTS_ONLY: веб-поиск отключен, собраны сегменты ICP и план ручного набора лидов."
            : "Веб-поиск не настроен: включен режим NO_WEB_SEARCH_CONFIGURED (Warm targets + company list sourcing + ranking template)."
        ],
        assumptions: [...(Array.isArray(intent.assumptions_applied) ? intent.assumptions_applied : [])],
        quality_checks: {
          no_gray_scraping: true,
          no_fabrication: true,
          dedupe_ok: true
        },
        search_debug: {
          geo_scope: String(intent.geo_scope || input.geo_scope || "cis").toLowerCase(),
          search_target: searchTarget,
          searchQueries: searchQueries,
          intent_json: {
            offer: intent.offer || {},
            icp: intent.icp || {},
            constraints: intent.constraints || {},
            buying_signal_lexicon: intent.buying_signal_lexicon || {},
            negative_lexicon: intent.negative_lexicon || {}
          },
          calls: [],
          llm_calls: llmCalls.map((call) => ({
            step: call.step,
            provider: call.provider,
            model: call.model,
            fetched_at: call.fetched_at,
            duration_ms: call.duration_ms,
            status: call.status,
            error: call.error || "",
            prompt_tokens: call.prompt_tokens || 0,
            completion_tokens: call.completion_tokens || 0,
            total_tokens: call.total_tokens || 0,
            items_count: call.items_count || null
          })),
          total_tokens: llmUsage.total_tokens,
          llm_not_called: !llmCalls.some((call) => String(call.status || "").toUpperCase() === "OK"),
          models_per_step: Object.fromEntries(
            llmCalls
              .filter((call) => call && call.step)
              .map((call) => [String(call.step), String(call.model || "unknown")])
          ),
          web_search: {
            enabled: false,
            reason: webSearchEnabled ? "disabled_by_workflow_mode" : "no_provider_configured",
            provider: providerLabel || "none"
          },
          mode: "POTENTIAL_CLIENTS_ONLY",
          candidates_from_input: providedCandidateCount,
          vendor_filtered_count: 0,
          geo_drop_count: 0,
          geo_drop_examples: [],
          filtered_irrelevant_count: 0,
          filtered_reasons: {}
        }
      }
    };
    applyBudgetMeta(output.meta, input);
    return { output: wrapOutput(output, input), effectiveInput: input };
  }

  const normalizeSearchItems = (items) =>
    (Array.isArray(items) ? items : [])
      .map((item, index) => {
        if (typeof item === "string") {
          return { rank: index + 1, title: item, url: item, source: "", snippet: "" };
        }
        const url = String(item?.url || item?.link || "").trim();
        if (!url || !/^https?:\/\//i.test(url)) return null;
        const title = String(item?.title || "").trim() || url;
        const snippet = String(item?.snippet || item?.description || "").trim();
        const source = String(item?.source || "").trim();
        const rank = Number.isFinite(Number(item?.rank)) ? Number(item.rank) : index + 1;
        return { rank, title, url, source, snippet };
      })
      .filter(Boolean);

  const queryLimit = input.mode === "quick" ? 5 : 6;
  const searchEngine =
    intent.language === "en" ? "google" : intent.language === "mixed" ? "google" : "yandex";
  const searchCalls = [];
  const excludeDomains = new Set(input.exclude_domains.map((item) => item.toLowerCase()));
  const excludeUrls = new Set(input.exclude_urls.map((item) => canonicalizeUrl(item)));
  const searchCandidates = [];
  const rejected_hot = [];
  const filteredReasonCounts = new Map();
  const sourceCategoryCounts = new Map();
  const entityRoleCounts = new Map();
  let vendorFilteredCount = 0;
  let geoDropCount = 0;
  const geoDropExamples = [];
  const runtimeGeoScope = String(intent.geo_scope || input.geo_scope || "cis").toLowerCase();
  const runtimeGeoProfile = buildGeoProfile({
    geoScope: runtimeGeoScope,
    geoTerms: intent.geo || [],
    language: intent.language || detectLanguage(intent.task_text || "")
  });

  const registerFilteredReason = (reason) => {
    if (!reason) return;
    filteredReasonCounts.set(reason, (filteredReasonCounts.get(reason) || 0) + 1);
  };

  const registerSourceCategory = (sourceType) => {
    if (!sourceType) return;
    sourceCategoryCounts.set(sourceType, (sourceCategoryCounts.get(sourceType) || 0) + 1);
  };

  const registerEntityRole = (entityRole) => {
    const safe = normalizeEntityRole(entityRole);
    entityRoleCounts.set(safe, (entityRoleCounts.get(safe) || 0) + 1);
  };

  const registerGeoDrop = ({ url, reason, domain }) => {
    geoDropCount += 1;
    registerFilteredReason("outside_geo");
    if (geoDropExamples.length < 5) {
      geoDropExamples.push({
        domain: normalizePhrase(domain || getUrlDomain(url || ""), 120) || "unknown",
        url: normalizePhrase(url || "", 320),
        reason: normalizePhrase(reason || "outside geo", 180)
      });
    }
  };

  const runSearch = async (query) => {
    const started = Date.now();
    const searchTimeoutMs = input.mode === "quick" ? 8000 : 12000;
    try {
      if (searchClient) {
        const response = await runWithTimeout(
          searchClient.search({
            query,
            limit: queryLimit,
            geo:
              input.geo ||
              (runtimeGeoProfile.geo_scope === "cis"
                ? "CIS"
                : runtimeGeoProfile.geo_scope === "custom"
                  ? runtimeGeoProfile.terms?.[0] || ""
                  : ""),
            source: searchEngine
          }),
          searchTimeoutMs,
          "SEARCH_TIMEOUT"
        );
        if (!response || response.ok === false) {
          return {
            ok: false,
            provider: response?.provider || "search-api",
            status: response?.status || "ERROR",
            usage_tokens: response?.usage_tokens ?? null,
            error: response?.error || "SEARCH_NOT_AVAILABLE",
            results: [],
            duration_ms: Date.now() - started,
            fetched_at: new Date().toISOString(),
            raw_json: response?.raw_json || null
          };
        }
        const normalized = normalizeSearchItems(response.results);
        return {
          ok: true,
          provider: response.provider || "search-api",
          status: "OK",
          usage_tokens: response.usage_tokens ?? null,
          error: "",
          results: normalized,
          duration_ms: Number(response.duration_ms || Date.now() - started),
          fetched_at: response.fetched_at || new Date().toISOString(),
          raw_json: response.raw_json || null
        };
      }

      if (webClient && typeof webClient.search === "function" && options.allowWebClientSearch !== false) {
        const response = await runWithTimeout(
          webClient.search(query, searchEngine, queryLimit),
          searchTimeoutMs,
          "SEARCH_TIMEOUT"
        );
        return {
          ok: true,
          provider: "webclient",
          status: "OK",
          usage_tokens: null,
          error: "",
          results: normalizeSearchItems(response),
          duration_ms: Date.now() - started,
          fetched_at: new Date().toISOString(),
          raw_json: null
        };
      }

      return {
        ok: false,
        provider: "none",
        status: "ERROR",
        usage_tokens: null,
        error: "SEARCH_NOT_AVAILABLE",
        results: [],
        duration_ms: Date.now() - started,
        fetched_at: new Date().toISOString(),
        raw_json: null
      };
    } catch (error) {
      return {
        ok: false,
        provider: searchClient ? "search-api" : "webclient",
        status: "ERROR",
        usage_tokens: null,
        error: error instanceof Error ? error.message : "SEARCH_PROVIDER_ERROR",
        results: [],
        duration_ms: Date.now() - started,
        fetched_at: new Date().toISOString(),
        raw_json: null
      };
    }
  };

  const requestedMaxWebRequests = Number(input.max_web_requests);
  const maxSearchCalls =
    Number.isFinite(requestedMaxWebRequests) && requestedMaxWebRequests > 0
      ? Math.max(1, Math.min(Math.round(requestedMaxWebRequests), searchQueries.length))
      : searchQueries.length;
  const activeQueries = searchQueries.slice(0, maxSearchCalls);

  for (let index = 0; index < activeQueries.length; index += 1) {
    const query = activeQueries[index];
    const call = await runSearch(query);
    const resultsToUse = call.results.filter((item) => item.url && isUrlAllowedByQuerySource(item.url, query));

    searchCalls.push({
      query,
      query_index: index,
      provider: call.provider,
      fetched_at: call.fetched_at,
      duration_ms: call.duration_ms,
      status: call.status,
      error: call.error || null,
      usage_tokens: call.usage_tokens,
      results_count: resultsToUse.length,
      sample_urls: resultsToUse.slice(0, 8).map((item) => item.url),
      raw_json: call.raw_json
    });

    if (!call.ok) continue;

    resultsToUse.forEach((item, resultIndex) => {
      const url = canonicalizeUrl(item.url);
      if (!url || excludeUrls.has(url)) return;
      let host = "";
      try {
        host = new URL(url).hostname.toLowerCase();
      } catch {
        return;
      }
      if (excludeDomains.has(host)) return;

      const sourceKind = detectSourceKind(url, `${item.title || ""} ${item.snippet || ""}`);
      registerSourceCategory(sourceKind);
      if (!LEAD_VISIBLE_SOURCE_TYPES.has(sourceKind)) {
        registerFilteredReason(`source_type_drop_${sourceKind}`);
        rejected_hot.push({
          url,
          reason: `source_type_drop_${sourceKind}`,
          confidence: 0
        });
        return;
      }

      const blockedCheck = isBlockedSource(url, item.title || "", item.snippet || "");
      if (blockedCheck.blocked) {
        registerFilteredReason(blockedCheck.reason);
        rejected_hot.push({
          url,
          reason: blockedCheck.reason,
          confidence: 0
        });
        return;
      }

      const geoCheck = evaluateGeoScopeFit({
        url,
        title: item.title || "",
        snippet: item.snippet || "",
        pageText: "",
        geoProfile: runtimeGeoProfile
      });
      if (!geoCheck.allowed) {
        registerGeoDrop({
          url,
          reason: geoCheck.reason || "outside geo",
          domain: geoCheck.domain
        });
        rejected_hot.push({
          url,
          reason: "outside_geo",
          confidence: 0
        });
        return;
      }

      const hotSourceAllowed = isHotSourceAllowed(url, sourceKind);

      searchCandidates.push({
        query,
        query_index: index,
        result_index: resultIndex,
        rank: Number.isFinite(Number(item.rank)) ? Number(item.rank) : resultIndex + 1,
        title: normalizePhrase(item.title || "", 240) || url,
        snippet: normalizePhrase(item.snippet || "", 400),
        source: normalizePhrase(item.source || host, 80),
        provider: call.provider,
        url,
        source_kind: sourceKind,
        hot_source_allowed: hotSourceAllowed
      });
    });
  }

  const successfulCalls = searchCalls.filter((item) => item.status === "OK");
  let searchStatusCode =
    activeQueries.length === 0
      ? "NO_RELEVANT_RESULTS"
      : !input.has_web_access || successfulCalls.length === 0
        ? "SEARCH_NOT_AVAILABLE"
        : "OK";

  const leads = [];
  const proof_items = [];
  const limitations = [];
  const dedupeKeys = new Set();
  const seedUrls = [];

  if (!input.has_web_access) {
    limitations.push("Веб-поиск отключен параметром has_web_access=false.");
  } else if (searchStatusCode === "SEARCH_NOT_AVAILABLE") {
    limitations.push("Поиск недоступен: проверьте SEARCH_PROVIDER/SEARCH_API_KEY или сетевую доступность.");
  } else if (searchStatusCode === "NO_RELEVANT_RESULTS" && activeQueries.length === 0) {
    limitations.push("Не удалось сформировать поисковые запросы из текста пользователя.");
  }
  if (intentResult.warning) {
    limitations.push("LLM PARSE_INTENT недоступен, использован fallback-парсер по тексту пользователя.");
  }

  const previousLeads = Array.isArray(lastData?.hot_leads) ? lastData.hot_leads : [];
  const previousKeys = new Set(
    previousLeads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
  );
  const maxLeads =
    input.mode === "continue" && previousLeads.length > 0
      ? Math.max(1, input.target_count - previousLeads.length)
      : input.target_count;
  const rawByDedupe = new Map();
  searchCandidates.forEach((candidate) => {
    const dedupeKey = buildCompositeLeadKey({
      url: candidate.url,
      title: candidate.title,
      fallbackText: `${candidate.title} ${candidate.snippet}`,
      input
    });
    if (!rawByDedupe.has(dedupeKey)) {
      rawByDedupe.set(dedupeKey, candidate);
    }
  });

  const uniqueCandidates = [...rawByDedupe.values()];
  uniqueCandidates.forEach((item) => {
    if (!seedUrls.includes(item.url)) seedUrls.push(item.url);
  });

  const negativeKeywords = buildNegativeKeywordSet({
    candidates: uniqueCandidates,
    intent,
    searchTarget
  });

  const fetchBudget =
    input.mode === "quick"
      ? Math.min(6, Math.max(2, Number(input.max_web_requests || 4)))
      : Math.min(18, Math.max(6, Number(input.max_web_requests || 8) * 2));
  let fetchCount = 0;
  const scoringCandidateLimit = Math.min(uniqueCandidates.length, input.mode === "quick" ? 18 : 40);
  const enrichedCandidates = [];

  for (const candidate of uniqueCandidates.slice(0, scoringCandidateLimit)) {
    const combinedPreview = `${candidate.title || ""} ${candidate.snippet || ""}`.trim() || candidate.url;
    let pageText = "";
    let mergedProofs = [
      {
        url: candidate.url,
        source_type: getSourceType(candidate.url),
        signal_type: "search_result",
        signal_value: candidate.query,
        evidence_snippet: sanitizeEvidenceSnippet(combinedPreview, 160)
      }
    ];

    if (webClient && typeof webClient.fetchPage === "function" && fetchCount < fetchBudget) {
      fetchCount += 1;
      const page = await runWithTimeout(
        webClient.fetchPage(candidate.url, { type: getSourceType(candidate.url) }),
        input.mode === "quick" ? 8000 : 12000,
        "FETCH_TIMEOUT"
      ).catch(() => ({ blocked: true, url: candidate.url }));
      if (!("blocked" in page) && page.text && page.text.trim().length >= 10) {
        pageText = page.text;
        const genericExtract = extractFromHtml(page.html || "", page.url);
        if (Array.isArray(genericExtract.proof_items)) {
          mergedProofs = [...mergedProofs, ...genericExtract.proof_items.slice(0, 2)];
        }
      }
    }

    const geoCheckWithPage = evaluateGeoScopeFit({
      url: candidate.url,
      title: candidate.title || "",
      snippet: candidate.snippet || "",
      pageText,
      geoProfile: runtimeGeoProfile
    });
    if (!geoCheckWithPage.allowed) {
      registerGeoDrop({
        url: candidate.url,
        reason: geoCheckWithPage.reason || "outside geo",
        domain: geoCheckWithPage.domain
      });
      rejected_hot.push({
        url: candidate.url,
        reason: "outside_geo",
        confidence: 0
      });
      continue;
    }

    enrichedCandidates.push({
      ...candidate,
      candidate_id: `c${candidate.query_index}-${candidate.result_index}-${enrichedCandidates.length}`,
      page_text: pageText,
      combined_preview: combinedPreview,
      merged_proofs: mergedProofs
    });
  }

  const scoringResult = await scoreCandidatesWithLLM({
    candidates: enrichedCandidates,
    intent,
    provider: llmProvider,
    negativeKeywords,
    searchTarget,
    mode: input.mode
  });
  llmUsage = addUsage(llmUsage, scoringResult.usage);
  llmCalls.push(...scoringResult.calls);

  for (const candidate of enrichedCandidates) {
    if (leads.length >= maxLeads) break;
    const score = scoringResult.scored.get(candidate.candidate_id) || {
      candidate_id: candidate.candidate_id,
      relevance_score: 0,
      entity_role: "other",
      lead_type: "Drop",
      has_buying_signal: false,
      reason: "SCORING_NOT_AVAILABLE",
      evidence: "",
      contact_hint: guessContactHint(candidate.url, candidate.snippet)
    };
    const entityRole = normalizeEntityRole(score.entity_role);
    registerEntityRole(entityRole);

    if (searchTarget !== "competitor_scan" && entityRole === "vendor") {
      vendorFilteredCount += 1;
      registerFilteredReason("entity_role_vendor_filtered");
      rejected_hot.push({
        url: candidate.url,
        reason: "entity_role_vendor_filtered",
        confidence: clampScore(score.relevance_score, 0)
      });
      continue;
    }

    if (score.lead_type === "Drop" || Number(score.relevance_score || 0) < RELEVANCE_DROP_THRESHOLD) {
      registerFilteredReason("relevance_below_threshold");
      rejected_hot.push({
        url: candidate.url,
        reason: "relevance_below_threshold",
        confidence: clampScore(score.relevance_score, 0)
      });
      continue;
    }

    const sourceText = candidate.page_text || candidate.combined_preview;
    const derived = generateHotLeadFromText(sourceText, candidate.url, input);
    const lead = derived.lead;
    const derivedProof = Array.isArray(derived.proofItems) ? derived.proofItems : [];
    const mergedProofs = [...candidate.merged_proofs, ...derivedProof];
    const confidence = clampScore(score.relevance_score, 0);

    lead.title = candidate.title || lead.title;
    lead.source = candidate.source || getSourceType(candidate.url);
    lead.request_summary = sanitizeEvidenceSnippet(candidate.snippet || sourceText.slice(0, 200), 200);
    lead.evidence = sanitizeEvidenceSnippet(
      score.evidence || candidate.snippet || sourceText.slice(0, 180),
      180
    );
    lead.search_query = candidate.query || "";
    lead.search_query_index = Number.isFinite(Number(candidate.query_index))
      ? Number(candidate.query_index)
      : null;
    lead.search_result_index = Number.isFinite(Number(candidate.result_index))
      ? Number(candidate.result_index)
      : null;
    lead.search_provider = candidate.provider || "";
    lead.search_rank = Number.isFinite(Number(candidate.rank)) ? Number(candidate.rank) : null;
    lead.geo_hint = (intent.geo && intent.geo[0]) || input.geo || "";
    lead.confidence = confidence;
    lead.hot_score = confidence;
    lead.why_match =
      normalizePhrase(score.reason, 220) ||
      "Совпадение по intent пользователя и сигналам намерения.";
    lead.contact_hint =
      normalizePhrase(score.contact_hint, 220) ||
      lead.contact_hint ||
      guessContactHint(candidate.url, candidate.snippet);
    lead.where_to_contact = lead.contact_hint;
    lead.explicit_intent = Boolean(score.has_buying_signal);
    lead.entity_role = entityRole;
    lead.is_hot_lead =
      entityRole === "buyer" && confidence >= HOT_THRESHOLD && lead.explicit_intent;
    lead.lead_type = lead.is_hot_lead ? "Hot" : "Warm";

    const companyOrOrganization = extractCompanyOrOrganization({
      title: candidate.title,
      snippet: `${candidate.snippet || ""} ${candidate.page_text || ""}`,
      url: candidate.url
    });
    lead.company_or_organization = companyOrOrganization;
    lead.who = lead.company_or_organization || "source post/job/tender";
    lead.source_kind =
      normalizePhrase(score.source_type, 40).toLowerCase() ||
      candidate.source_kind ||
      detectSourceKind(candidate.url, candidate.snippet || "");
    lead.source_type = lead.source_kind;
    if (!lead.company_or_organization) {
      if (lead.source_kind === "job") {
        lead.company_or_organization = "source job";
      } else if (lead.source_kind === "tender") {
        lead.company_or_organization = "source tender";
      } else if (lead.source_kind === "social_post") {
        lead.company_or_organization = "source post";
      } else {
        lead.company_or_organization = "source post/job/tender";
      }
      lead.who = lead.company_or_organization;
      lead.is_hot_lead = false;
      lead.lead_type = "Warm";
    }

    if (entityRole !== "buyer" && lead.lead_type === "Hot") {
      lead.is_hot_lead = false;
      lead.lead_type = "Warm";
    }
    if (searchTarget === "competitor_scan" && entityRole === "vendor") {
      lead.is_hot_lead = false;
      lead.lead_type = "Warm";
    }

    if (lead.is_hot_lead && !Boolean(candidate.hot_source_allowed)) {
      lead.is_hot_lead = false;
      lead.lead_type = "Warm";
      lead.why_match = `${lead.why_match} Источник не из allowlist для Hot, понижен до Warm.`;
    }
    lead.why_now = lead.why_match;

    const recalculatedIntentClass = classifyIntent(
      [candidate.title, candidate.snippet, candidate.page_text].filter(Boolean).join(" ")
    );
    lead.intent_class = recalculatedIntentClass;
    lead.reply_angle_options = buildReplyAngleOptions(
      recalculatedIntentClass,
      lead.risk_flags?.privacy_risk === true
    );
    lead.qualification_question = buildQualificationQuestion(recalculatedIntentClass);
    lead.dedupe_key = buildCompositeLeadKey({
      url: candidate.url,
      title: lead.title,
      fallbackText: sourceText,
      input
    });

    if (input.require_proof && mergedProofs.length === 0) {
      registerFilteredReason("no_proof");
      rejected_hot.push({ url: candidate.url, reason: "no_proof", confidence });
      continue;
    }
    if (previousKeys.has(lead.dedupe_key)) {
      registerFilteredReason("already_seen_previous_run");
      continue;
    }
    if (dedupeKeys.has(lead.dedupe_key)) {
      registerFilteredReason("dedupe_duplicate");
      continue;
    }
    dedupeKeys.add(lead.dedupe_key);

    const proofRefs = [];
    mergedProofs.slice(0, 5).forEach((item) => {
      proofRefs.push(proof_items.length);
      proof_items.push(item);
    });
    lead.proof_refs = proofRefs;
    leads.push(lead);
  }

  const hadSearchLeads = leads.length > 0;
  if (!hadSearchLeads && searchStatusCode !== "SEARCH_NOT_AVAILABLE") {
    searchStatusCode = "NO_RELEVANT_RESULTS";
    limitations.push(`Релевантные лиды не найдены (порог релевантности: ${RELEVANCE_THRESHOLD}).`);
  }

  if (leads.length === 0) {
    const fallbackWarm = buildFallbackWarmTargets({
      intent,
      limit: Math.min(20, Math.max(8, maxLeads))
    });
    if (fallbackWarm.length > 0) {
      fallbackWarm.forEach((item) => leads.push(item));
      limitations.push(
        "Hot лиды с подтвержденным сигналом не найдены; добавлены Warm targets по ICP и intent."
      );
    }
  }

  const hotCount = leads.filter((lead) => lead.lead_type === "Hot").length;
  const warmCount = leads.filter((lead) => lead.lead_type === "Warm").length;
  const filteredIrrelevantCount = rejected_hot.length;
  if (geoDropCount > 0) {
    limitations.push(
      `Отфильтровано вне гео (${runtimeGeoProfile.geo_scope}): ${geoDropCount}.`
    );
  }
  if (hotCount === 0 && warmCount > 0) {
    limitations.push(
      "Hot лиды не найдены. Можно включить режим Signals расширенно: расширить гео/язык/индустрии."
    );
  }

  const stats = webClient && typeof webClient.getStats === "function"
    ? webClient.getStats()
    : {
        requests_made: 0,
        blocked_count: 0,
        errors_count: 0,
        duration_ms: 0,
        top_errors: [],
        warnings: []
      };
  const trace = webClient && typeof webClient.getTrace === "function" ? webClient.getTrace() : [];
  const traceSummary = trace.reduce((acc, item) => {
    const key = `${item.domain}:${item.type}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    hot_leads: leads.sort(
      (a, b) =>
        Number(b.confidence || b.hot_score || 0) - Number(a.confidence || a.hot_score || 0)
    ),
    meta: {
      generated_at: new Date().toISOString(),
      status_code: searchStatusCode,
      search_plan,
      search_debug: {
        geo_scope: runtimeGeoProfile.geo_scope,
        search_target: searchTarget,
        searchQueries: searchQueries,
        intent_json: {
          offer: intent.offer || {},
          icp: intent.icp || {},
          constraints: intent.constraints || {},
          buying_signal_lexicon: intent.buying_signal_lexicon || {},
          negative_lexicon: intent.negative_lexicon || {},
          flat: {
            product_or_service: intent.product_or_service || [],
            target_customer: intent.target_customer || [],
            geo: intent.geo || [],
            geo_scope: intent.geo_scope || input.geo_scope || "cis",
            company_size: intent.company_size || [],
            industries: intent.industries || [],
            roles: intent.roles || [],
            buying_signals: intent.buying_signals || [],
            language: intent.language || "mixed",
            keywords: intent.keywords || [],
            synonyms_ru_en: intent.synonyms_ru_en || [],
            negative_keywords: intent.negative_keywords || [],
            constraints: intent.constraints || [],
            must_not_have: intent.must_not_have || [],
            domains: intent.domains || []
          }
        },
        calls: searchCalls.map((call) => ({
          query: call.query,
          query_index: call.query_index,
          provider: call.provider,
          fetched_at: call.fetched_at,
          duration_ms: call.duration_ms,
          status: call.status,
          error: call.error,
          usage_tokens: call.usage_tokens,
          results_count: call.results_count,
          sample_urls: call.sample_urls
        })),
        llm_calls: llmCalls.map((call) => ({
          step: call.step,
          provider: call.provider,
          model: call.model,
          fetched_at: call.fetched_at,
          duration_ms: call.duration_ms,
          status: call.status,
          error: call.error || "",
          prompt_tokens: call.prompt_tokens || 0,
          completion_tokens: call.completion_tokens || 0,
          total_tokens: call.total_tokens || 0,
          items_count: call.items_count || null
        })),
        llm_not_called: !llmCalls.some((call) => String(call.status || "").toUpperCase() === "OK"),
        total_tokens: llmUsage.total_tokens,
        models_per_step: Object.fromEntries(
          llmCalls
            .filter((call) => call && call.step)
            .map((call) => [String(call.step), String(call.model || "unknown")])
        ),
        web_search: {
          enabled: true,
          reason: "provider_enabled",
          provider: providerLabel || "configured"
        },
        candidates_from_input: providedCandidateCount,
        vendor_filtered_count: vendorFilteredCount,
        geo_drop_count: geoDropCount,
        geo_drop_examples: geoDropExamples.slice(0, 5),
        entity_role_counts: Object.fromEntries(
          [...entityRoleCounts.entries()].sort((a, b) => b[1] - a[1])
        ),
        source_categories: Object.fromEntries(
          [...sourceCategoryCounts.entries()].sort((a, b) => b[1] - a[1])
        ),
        dropped_articles_forums:
          Number(filteredReasonCounts.get("source_type_drop_blog/article") || 0) +
          Number(filteredReasonCounts.get("source_type_drop_forum/qna") || 0) +
          Number(filteredReasonCounts.get("source_type_drop_dictionary") || 0),
        negative_keywords: [...negativeKeywords],
        filtered_irrelevant_count: filteredIrrelevantCount,
        filtered_reasons: Object.fromEntries(
          [...filteredReasonCounts.entries()].sort((a, b) => b[1] - a[1])
        )
      },
      negative_keywords: [...negativeKeywords],
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
      rejected_hot: rejected_hot.slice(0, 50),
      lead_stats: {
        total: leads.length,
        hot: hotCount,
        warm: warmCount,
        vendor_filtered_count: vendorFilteredCount,
        geo_drop_count: geoDropCount,
        relevance_threshold: RELEVANCE_THRESHOLD,
        filtered_irrelevant_count: filteredIrrelevantCount,
        filtered_total: rejected_hot.length,
        source_categories_used: Object.fromEntries(
          [...sourceCategoryCounts.entries()].sort((a, b) => b[1] - a[1])
        ),
        dropped_articles_forums:
          Number(filteredReasonCounts.get("source_type_drop_blog/article") || 0) +
          Number(filteredReasonCounts.get("source_type_drop_forum/qna") || 0) +
          Number(filteredReasonCounts.get("source_type_drop_dictionary") || 0),
        llm_tokens_total: llmUsage.total_tokens
      },
      limitations,
      assumptions: [
        ...(Array.isArray(intent.assumptions_applied) ? intent.assumptions_applied : [])
      ],
      quality_checks: {
        no_gray_scraping: true,
        no_fabrication: proof_items.length > 0 || leads.length === 0,
        dedupe_ok: dedupeKeys.size === leads.length
      }
    }
  };
  if (activeQueries.length < searchQueries.length) {
    output.meta.search_plan.query_limit_applied = true;
    output.meta.search_plan.queries_executed = activeQueries.length;
    output.meta.search_plan.queries_total = searchQueries.length;
  }
  applyBudgetMeta(output.meta, input);

  const envelope = wrapOutput(output, input);
  if (input.mode === "refresh" && options.last_run) {
    const prev = unwrapLegacy(options.last_run);
    const prevLeads = Array.isArray(prev.hot_leads) ? prev.hot_leads : [];
    const prevKeys = new Set(
      prevLeads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
    );
    const currentKeys = new Set(
      leads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
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
