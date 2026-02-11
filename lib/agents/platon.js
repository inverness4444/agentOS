const DEFAULT_WHAT_WE_SELL =
  "Платформа автоматизации с ИИ-агентами для бизнеса (лидоген, поддержка, контент, аналитика, автоматизация процессов)";

const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const {
  extractDomainFromUrl,
  makeDedupeKey,
  normalizePhone
} = require("../../utils/normalize.js");
const { extractFromHtml } = require("../../extractors");

const inputDefaults = {
  mode: "deep",
  industry_or_niche: "",
  geo: "",
  channel: "Mixed",
  size: "",
  what_we_sell: DEFAULT_WHAT_WE_SELL,
  exclude_list: [],
  min_confidence: 40,
  target_count: null,
  require_signals: true,
  allow_placeholders_if_no_web: true,
  has_web_access: true,
  max_web_requests: null,
  preferred_sources: ["WB", "Ozon", "Yandex", "VK", "Telegram", "OfficialWebsite"],
  recency_days: 365,
  allow_placeholders_if_blocked: true,
  confidence_weights: {
    fit_score: 0.45,
    pain_score: 0.3,
    signal_strength: 0.25
  }
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: {
      type: "string",
      enum: [
        "quick",
        "deep",
        "continue",
        "targets_only",
        "segments_only",
        "seed_only",
        "refresh"
      ],
      default: "deep"
    },
    industry_or_niche: { type: "string", default: "" },
    geo: { type: "string", default: "" },
    channel: {
      type: "string",
      enum: ["WB", "Ozon", "D2C", "OfflineServices", "B2B", "Mixed"],
      default: "Mixed"
    },
    size: { type: "string", enum: ["micro", "smb", "mid", ""], default: "" },
    what_we_sell: { type: "string", default: DEFAULT_WHAT_WE_SELL },
    exclude_list: { type: "array", items: { type: "string" }, default: [] },
    min_confidence: { type: "number", default: 40 },
    target_count: { type: "number" },
    require_signals: { type: "boolean", default: true },
    allow_placeholders_if_no_web: { type: "boolean", default: true },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    preferred_sources: {
      type: "array",
      items: { type: "string" },
      default: ["WB", "Ozon", "Yandex", "VK", "Telegram", "OfficialWebsite"]
    },
    recency_days: { type: "number", default: 365 },
    allow_placeholders_if_blocked: { type: "boolean", default: true },
    confidence_weights: {
      type: "object",
      properties: {
        fit_score: { type: "number" },
        pain_score: { type: "number" },
        signal_strength: { type: "number" }
      }
    }
  },
  required: ["mode", "what_we_sell"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["segments", "company_candidates", "meta"],
  additionalProperties: false,
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        required: [
          "segment_name",
          "geo",
          "avg_check_or_margin_estimate",
          "LPR",
          "pain_triggers",
          "why_agentos",
          "recommended_entry_offer",
          "typical_stack",
          "top_objections",
          "proof_ideas",
          "antiICP",
          "minimum_viable_signals"
        ],
        additionalProperties: false,
        properties: {
          segment_name: { type: "string" },
          geo: { type: "string" },
          avg_check_or_margin_estimate: { type: "string" },
          LPR: { type: "array", items: { type: "string" } },
          pain_triggers: { type: "array", items: { type: "string" } },
          why_agentos: { type: "array", items: { type: "string" } },
          recommended_entry_offer: { type: "string" },
          typical_stack: { type: "array", items: { type: "string" } },
          top_objections: { type: "array", items: { type: "string" } },
          proof_ideas: { type: "array", items: { type: "string" } },
          antiICP: { type: "array", items: { type: "string" } },
          minimum_viable_signals: { type: "array", items: { type: "string" } }
        }
      }
    },
    company_candidates: {
      type: "array",
      items: {
        type: "object",
        required: [
          "channel",
          "segment_match",
          "why_here",
          "next_step_message_angle",
          "source_notes",
          "first_offer",
          "expected_outcome",
          "required_access",
          "dedupe_key",
          "source_proof",
          "fit_score"
        ],
        additionalProperties: true,
        properties: {
          name: { type: "string" },
          link: { type: "string" },
          name_placeholder: { type: "string" },
          search_query: { type: "string" },
          channel: { type: "string" },
          segment_match: { type: "string" },
          why_here: { type: "string" },
          confidence: { type: "number" },
          confidence_estimate: { type: "number" },
          next_step_message_angle: { type: "string" },
          source_notes: { type: "string" },
          first_offer: { type: "string" },
          expected_outcome: { type: "string" },
          required_access: { type: "string" },
          low_quality: { type: "boolean" },
          estimate: { type: "boolean" },
          dedupe_key: { type: "string" },
          fit_score: { type: "number" },
          pain_score: { type: "number" },
          signal_strength: { type: "number" },
          proof_refs: { type: "array", items: { type: "number" } },
          why_here_proof_refs: { type: "array", items: { type: "number" } },
          source_proof: {
            type: "array",
            items: {
              type: "object",
              required: ["url", "title", "evidence_snippet", "signal_type"],
              additionalProperties: false,
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                evidence_snippet: { type: "string" },
                signal_type: { type: "string" },
                signal_value: { type: ["string", "number"] }
              }
            }
          }
        }
      }
    },
    meta: {
      type: "object",
      required: [
        "generated_at",
        "assumptions",
        "limitations",
        "marketplace_queries",
        "yandex_queries",
        "vk_tg_queries",
        "rejected_candidates",
        "web_stats",
        "search_templates",
        "search_plan",
        "search_queries_used_by_segment",
        "dedupe_report",
        "next_manual_actions"
      ],
      additionalProperties: false,
      properties: {
        generated_at: { type: "string" },
        assumptions: { type: "array", items: { type: "string" } },
        limitations: { type: "array", items: { type: "string" } },
        marketplace_queries: { type: "array", items: { type: "string" } },
        yandex_queries: { type: "array", items: { type: "string" } },
        vk_tg_queries: { type: "array", items: { type: "string" } },
        rejected_candidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["reason"],
            properties: {
              name: { type: "string" },
              link: { type: "string" },
              reason: { type: "string" }
            }
          }
        },
        web_stats: {
          type: "object",
          additionalProperties: false,
          required: [
            "requests_made",
            "blocked_count",
            "errors_count",
            "duration_ms",
            "sources_used",
            "blocked_by_source",
            "fallback_used",
            "fallback_strategies_used",
            "top_errors",
            "warnings"
          ],
          properties: {
            requests_made: { type: "number" },
            blocked_count: { type: "number" },
            errors_count: { type: "number" },
            duration_ms: { type: "number" },
            sources_used: {
              type: "object",
              additionalProperties: false,
              required: ["yandex", "wb", "ozon", "vk", "tg", "websites"],
              properties: {
                yandex: { type: "number" },
                wb: { type: "number" },
                ozon: { type: "number" },
                vk: { type: "number" },
                tg: { type: "number" },
                websites: { type: "number" }
              }
            },
            blocked_by_source: {
              type: "object",
              additionalProperties: false,
              required: ["yandex", "wb", "ozon", "vk", "tg", "websites"],
              properties: {
                yandex: { type: "number" },
                wb: { type: "number" },
                ozon: { type: "number" },
                vk: { type: "number" },
                tg: { type: "number" },
                websites: { type: "number" }
              }
            },
            fallback_used: { type: "boolean" },
            fallback_strategies_used: { type: "array", items: { type: "string" } },
            top_errors: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["domain", "code", "count"],
                properties: {
                  domain: { type: "string" },
                  code: { type: "string" },
                  count: { type: "number" }
                }
              }
            },
            warnings: { type: "array", items: { type: "string" } }
          }
        },
        search_templates: {
          type: "object",
          additionalProperties: false,
          required: ["marketplace_queries", "yandex_queries", "vk_tg_queries"],
          properties: {
            marketplace_queries: { type: "array", items: { type: "string" } },
            yandex_queries: { type: "array", items: { type: "string" } },
            vk_tg_queries: { type: "array", items: { type: "string" } }
          }
        },
        search_plan: {
          type: "object",
          additionalProperties: false,
          required: ["queries_used"],
          properties: {
            queries_used: { type: "array", items: { type: "string" } }
          }
        },
        search_queries_used_by_segment: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["segment_name", "queries"],
            properties: {
              segment_name: { type: "string" },
              queries: { type: "array", items: { type: "string" } }
            }
          }
        },
        dedupe_report: {
          type: "object",
          additionalProperties: false,
          required: [
            "scanned_total",
            "kept_total",
            "removed_total",
            "removed_by_domain",
            "removed_by_inn",
            "removed_by_phone"
          ],
          properties: {
            scanned_total: { type: "number" },
            kept_total: { type: "number" },
            removed_total: { type: "number" },
            removed_by_domain: { type: "number" },
            removed_by_inn: { type: "number" },
            removed_by_phone: { type: "number" }
          }
        },
        next_manual_actions: { type: "array", items: { type: "string" } }
      }
    }
  }
};

const systemPrompt = `Ты — ИИ-агент: "Платон — находит подходящие компании для продаж.".
Роль: production-ресёрчер по России/СНГ. Определяй ICP-сегменты и формируй список компаний-кандидатов для продаж на основе только публичных сигналов.

Ограничения:
- Работай только с безопасными публичными сигналами.
- Не запрашивай и не храни персональные данные.
- ЛПР указывай ролями (владелец, директор по маркетингу, руководитель ecom).
- Не выдумывай факты, компании и ссылки.
- Соблюдай robots.txt; если доступ запрещен — не парси, помечай как blocked.

Пайплайн (детерминированный):
A) Сегменты: сформируй 5-8 segments[].
B) План поиска: Yandex queries, WB/Ozon discovery plan, VK/TG plan.
C) Seed results: взять топ N результатов на каждый запрос.
D) Enrichment: открыть 1-3 страницы кандидата, извлечь сигналы.
E) Scoring & filtering: confidence по формуле, fit_score отдельно.
F) Dedupe & exclude: исключить exclude_list/last_run.
G) Финальный JSON.

Анти-галлюцинации:
- Каждый кандидат обязан иметь source_proof (2-4 доказательства): { url, title, evidence_snippet, signal_type }.
- why_here и source_notes строятся только из source_proof.
- Если require_signals=true и меньше 2 сигналов — кандидат в rejected_candidates.

Режимы (input.mode): quick | deep | targets_only | segments_only | refresh.

Скоринг confidence (cap 100):
- есть витрина WB/Ozon / карточки товаров: +10
- много отзывов (200+): +15
- обновления/новые SKU/активный ассортимент: +10
- конкурентная категория/много продавцов: +10
- VK/TG постинг >= 2 раз в неделю: +10
- вовлеченность (комменты/реакции): +10
- Яндекс интенты "купить/доставка/оптом/поставщик/цена": +10
- ops pain (заявки/CRM/колл-центр/логистика/отзывы/контент): +15

Playbook продукта:
- WB/Ozon: автоответы на отзывы, оптимизация карточек, мониторинг конкурентов/цен, контроль остатков/логистики, поддержка в сообщениях, обработка оптовых заявок.
- D2C: лидоген и квалификация, контент-план, поддержка/FAQ, возвраты/доставка, CRM-рутины.
- Offline services: запись/расписание, обработка лидов, мессенджеры + колл-центр, напоминания, репутация/отзывы.
- B2B: поиск лидов/тендеров, квалификация, КП, follow-ups, обновление CRM, отчеты.

Формат:
- segments[]: segment_name, geo, avg_check_or_margin_estimate (estimate), LPR, pain_triggers (3-6), why_agentos (2-4), recommended_entry_offer (3-7 дней), typical_stack, top_objections (3), proof_ideas.
- company_candidates[]: name/link или placeholders (name_placeholder/search_query), channel, segment_match, why_here, confidence, fit_score, next_step_message_angle, source_notes, first_offer, expected_outcome (estimate), required_access, low_quality?, estimate?, dedupe_key, source_proof[].
- meta: generated_at, assumptions, limitations, marketplace_queries, yandex_queries, vk_tg_queries, rejected_candidates, web_stats, search_templates, next_manual_actions.

Если нет веб-доступа или источники заблокированы — placeholders допускаются только при allow_placeholders_if_blocked=true и с явной пометкой estimate.`;

const platonAgent = {
  id: "platon-prospect-research-ru",
  displayName: "Платон — находит подходящие компании для продаж.",
  description:
    "Определяет ICP-сегменты и формирует список компаний-кандидатов для продаж на основе безопасных публичных сигналов.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const MODES = new Set([
  "quick",
  "deep",
  "continue",
  "targets_only",
  "segments_only",
  "seed_only",
  "refresh"
]);
const CHANNELS = new Set(["WB", "Ozon", "D2C", "OfflineServices", "B2B", "Mixed"]);
const SIZES = new Set(["micro", "smb", "mid", ""]);
const SOURCES = new Set([
  "WB",
  "Ozon",
  "Yandex",
  "VK",
  "Telegram",
  "OfficialWebsite"
]);

const resolveTargetCount = (mode, targetCount) => {
  if (typeof targetCount === "number" && Number.isFinite(targetCount) && targetCount > 0) {
    return Math.round(targetCount);
  }
  return mode === "quick" ? 15 : 30;
};

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
  const channel = CHANNELS.has(safe.channel) ? safe.channel : "Mixed";
  const size = SIZES.has(safe.size) ? safe.size : "";
  const preferredSources = Array.isArray(safe.preferred_sources)
    ? safe.preferred_sources.filter((item) => SOURCES.has(item))
    : ["WB", "Ozon", "Yandex", "VK", "Telegram", "OfficialWebsite"];
  const excludeList = Array.isArray(safe.exclude_list)
    ? safe.exclude_list.filter((item) => typeof item === "string" && item.trim())
    : [];
  const minConfidence =
    typeof safe.min_confidence === "number" && Number.isFinite(safe.min_confidence)
      ? Math.min(100, Math.max(0, safe.min_confidence))
      : 40;
  const rawWeights =
    safe.confidence_weights && typeof safe.confidence_weights === "object"
      ? safe.confidence_weights
      : {};
  const parsedWeights = {
    fit_score:
      typeof rawWeights.fit_score === "number" && Number.isFinite(rawWeights.fit_score)
        ? Math.max(0, rawWeights.fit_score)
        : 0.45,
    pain_score:
      typeof rawWeights.pain_score === "number" && Number.isFinite(rawWeights.pain_score)
        ? Math.max(0, rawWeights.pain_score)
        : 0.3,
    signal_strength:
      typeof rawWeights.signal_strength === "number" && Number.isFinite(rawWeights.signal_strength)
        ? Math.max(0, rawWeights.signal_strength)
        : 0.25
  };
  const totalWeight = parsedWeights.fit_score + parsedWeights.pain_score + parsedWeights.signal_strength;
  const confidenceWeights =
    totalWeight > 0
      ? {
          fit_score: Number((parsedWeights.fit_score / totalWeight).toFixed(4)),
          pain_score: Number((parsedWeights.pain_score / totalWeight).toFixed(4)),
          signal_strength: Number((parsedWeights.signal_strength / totalWeight).toFixed(4))
        }
      : { fit_score: 0.45, pain_score: 0.3, signal_strength: 0.25 };
  const targetCount = resolveTargetCount(mode, safe.target_count);
  const maxRequests = resolveMaxRequests(mode, safe.max_web_requests);

  const normalized = {
    mode,
    industry_or_niche:
      typeof safe.industry_or_niche === "string" ? safe.industry_or_niche : "",
    geo: typeof safe.geo === "string" ? safe.geo : "",
    channel,
    size,
    what_we_sell:
      typeof safe.what_we_sell === "string" && safe.what_we_sell.trim()
        ? safe.what_we_sell.trim()
        : DEFAULT_WHAT_WE_SELL,
    exclude_list: excludeList,
    min_confidence: minConfidence,
    target_count: targetCount,
    require_signals:
      typeof safe.require_signals === "boolean" ? safe.require_signals : true,
    allow_placeholders_if_no_web:
      typeof safe.allow_placeholders_if_no_web === "boolean"
        ? safe.allow_placeholders_if_no_web
        : true,
    has_web_access:
      typeof safe.has_web_access === "boolean" ? safe.has_web_access : true,
    max_web_requests: maxRequests,
    preferred_sources: preferredSources,
    recency_days:
      typeof safe.recency_days === "number" && Number.isFinite(safe.recency_days)
        ? Math.max(1, Math.round(safe.recency_days))
        : 365,
    allow_placeholders_if_blocked:
      typeof safe.allow_placeholders_if_blocked === "boolean"
        ? safe.allow_placeholders_if_blocked
        : true,
    confidence_weights: confidenceWeights
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

const SIGNAL_LIBRARY = {
  marketplace_storefront: { label: "есть витрина WB/Ozon", weight: 10, type: "marketplace" },
  reviews_200: { label: "200+ отзывов", weight: 15, type: "marketplace" },
  active_sku: { label: "активные обновления SKU", weight: 10, type: "marketplace" },
  competitive_category: { label: "конкурентная категория", weight: 10, type: "marketplace" },
  social_posting: { label: "VK/TG постинг 2+ в неделю", weight: 10, type: "social" },
  social_engagement: { label: "вовлеченность в комментариях", weight: 10, type: "social" },
  yandex_intent: { label: "Яндекс интенты купить/доставка/оптом/поставщик", weight: 10, type: "intent" },
  ops_pain: { label: "много операционных процессов (CRM/колл-центр/логистика/контент)", weight: 15, type: "ops" }
};

const scoreSignalStrength = (signalKeys) => {
  const score = signalKeys.reduce((total, key) => {
    const signal = SIGNAL_LIBRARY[key];
    return total + (signal ? signal.weight : 0);
  }, 0);
  return Math.min(100, score);
};

const scorePain = (signalKeys) => {
  let score = 20;
  if (signalKeys.includes("ops_pain")) score += 45;
  if (signalKeys.includes("reviews_200")) score += 10;
  if (signalKeys.includes("social_engagement")) score += 15;
  if (signalKeys.includes("yandex_intent")) score += 10;
  return Math.min(100, score);
};

const scoreConfidence = (fitScore, painScore, signalStrength, weights) => {
  const safe = weights && typeof weights === "object" ? weights : {};
  const fitWeight = Number.isFinite(safe.fit_score) ? safe.fit_score : 0.45;
  const painWeight = Number.isFinite(safe.pain_score) ? safe.pain_score : 0.3;
  const signalWeight = Number.isFinite(safe.signal_strength) ? safe.signal_strength : 0.25;
  const total =
    fitScore * fitWeight + painScore * painWeight + signalStrength * signalWeight;
  return Math.max(0, Math.min(100, Math.round(total)));
};

const painStrength = (signalKeys) => {
  return scorePain(signalKeys);
};

const normalizeDedupeKey = (name = "", link = "") => {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedLink = typeof link === "string" ? link.trim() : "";
  const domain =
    extractDomainFromUrl(canonicalizeUrl(normalizedLink || "")) ||
    extractDomainFromUrl(normalizedName);
  return makeDedupeKey({ domain, name: normalizedName }, { prefix: false });
};

const extractInnFromText = (text = "") => {
  const match = text.match(/ИНН\s*(\d{10,12})/i);
  return match && match[1] ? match[1] : "";
};

const extractPhoneFromText = (text = "") => {
  const match = text.match(/(\+7|8)\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
  if (!match || !match[0]) return "";
  return normalizePhone(match[0]);
};

const isAggregator = (name = "") => {
  const lower = name.toLowerCase();
  const keywords = [
    "каталог",
    "агрегатор",
    "список",
    "топ",
    "рейтинг",
    "справочник",
    "франшиз",
    "каталоги"
  ];
  return keywords.some((keyword) => lower.includes(keyword));
};

const segmentTemplates = [
  {
    key: "mp-brands",
    channels: ["WB", "Ozon"],
    segment_name: "WB/Ozon бренд-селлеры с активным ассортиментом",
    avg_check_or_margin_estimate:
      "Средний чек 1 200-3 500 ₽, маржа 20-35% (estimate)",
    LPR: ["владелец", "руководитель ecom", "директор по маркетингу"],
    pain_triggers: [
      "много отзывов и вопросов",
      "контент не успевает за SKU",
      "конкурентная категория",
      "снижение конверсии карточек"
    ],
    why_agentos: [
      "автоответы на отзывы и сообщения",
      "генерация/оптимизация карточек",
      "мониторинг конкурентов и цен"
    ],
    recommended_entry_offer:
      "3-7 дней: аудит 10 карточек + автоответы на отзывы",
    typical_stack: ["WB/Ozon кабинет", "таблицы SKU", "мессенджеры"],
    top_objections: ["у нас уже есть контент-менеджер", "дорого", "непонятно как внедрять"],
    proof_ideas: [
      "показать рост рейтинга/конверсии на 5-10 карточках",
      "сравнить ответы на отзывы до/после"
    ],
    antiICP: [
      "агрегаторы и рейтинги без собственного бренда",
      "селлеры без ассортимента и без отзывов",
      "проекты без публичных следов продаж"
    ],
    minimum_viable_signals: [
      "есть витрина WB/Ozon",
      "200+ отзывов или активный поток вопросов",
      "признаки операционной нагрузки (логистика/контент/ответы)"
    ]
  },
  {
    key: "mp-niche",
    channels: ["WB", "Ozon"],
    segment_name: "Нишевые бренды на WB/Ozon с сильными отзывами",
    avg_check_or_margin_estimate:
      "Средний чек 1 500-5 000 ₽, маржа 25-40% (estimate)",
    LPR: ["владелец", "бренд-менеджер", "руководитель ecom"],
    pain_triggers: [
      "зависимость от рейтинга",
      "много SKU без поддержки",
      "ручная работа с акциями"
    ],
    why_agentos: [
      "мониторинг отзывов и конкурентов",
      "контент для акций",
      "контроль логистики и остатков"
    ],
    recommended_entry_offer:
      "3-5 дней: мониторинг отзывов + план улучшений по 1 категории",
    typical_stack: ["WB/Ozon", "таблицы", "чат поддержки"],
    top_objections: ["мы маленький бренд", "нет ресурсов на внедрение", "достаточно текущих инструментов"],
    proof_ideas: [
      "показать рост рейтинга после автоответов",
      "быстрый контент-пакет под акции"
    ],
    antiICP: [
      "one-product витрины без движения",
      "пустые каталоги без отзывов",
      "перепродажа без собственного бренда"
    ],
    minimum_viable_signals: [
      "видна витрина и ассортимент",
      "есть заметный объём отзывов/вопросов",
      "видны изменения карточек/акций"
    ]
  },
  {
    key: "d2c",
    channels: ["D2C"],
    segment_name: "D2C-бренды с собственным сайтом и активным контентом",
    avg_check_or_margin_estimate:
      "Средний чек 2 000-8 000 ₽, маржа 30-50% (estimate)",
    LPR: ["владелец", "директор по маркетингу", "growth lead"],
    pain_triggers: [
      "дорогой лид и низкая конверсия",
      "много входящих без обработки",
      "нужен постоянный контент"
    ],
    why_agentos: [
      "лидоген и квалификация",
      "контент-план и FAQ",
      "автоматизация CRM-рутин"
    ],
    recommended_entry_offer:
      "3-7 дней: лидоген-бот + автоответы на топ-20 вопросов",
    typical_stack: ["сайт", "CRM", "мессенджеры"],
    top_objections: ["у нас уже есть маркетолог", "сложно внедрять", "не нужен AI"],
    proof_ideas: [
      "показать рост скорости ответа",
      "первые квалифицированные лиды за неделю"
    ],
    antiICP: [
      "лендинги-визитки без заявок",
      "проекты без входящего канала",
      "компании без команды на обработку лидов"
    ],
    minimum_viable_signals: [
      "есть сайт/форма/чат",
      "есть входящие запросы или комментарии",
      "видны повторяющиеся вопросы клиентов"
    ]
  },
  {
    key: "offline-services",
    channels: ["OfflineServices"],
    segment_name: "Offline services: ремонт, мед, бьюти (3-20 точек)",
    avg_check_or_margin_estimate:
      "Средний чек 2 500-15 000 ₽, маржа 25-45% (estimate)",
    LPR: ["владелец", "управляющий", "руководитель колл-центра"],
    pain_triggers: [
      "потеря заявок",
      "много звонков и сообщений",
      "репутация и отзывы"
    ],
    why_agentos: [
      "запись/расписание",
      "обработка лидов",
      "напоминания и работа с отзывами"
    ],
    recommended_entry_offer:
      "3-5 дней: автообработка заявок + напоминания",
    typical_stack: ["мессенджеры", "колл-центр", "CRM/таблица"],
    top_objections: ["у нас администратор справляется", "не хотим менять процессы", "дорого"],
    proof_ideas: [
      "снижение пропущенных заявок",
      "скорость записи и ответа"
    ],
    antiICP: [
      "одиночные мастера без нагрузки",
      "точки без онлайн-контактов",
      "бизнесы без отзывов и расписания"
    ],
    minimum_viable_signals: [
      "есть запись/телефон/мессенджер",
      "видна операционная боль по отзывам",
      "есть регулярный поток обращений"
    ]
  },
  {
    key: "b2b",
    channels: ["B2B"],
    segment_name: "B2B подрядчики: логистика, производство, IT-аутсорс",
    avg_check_or_margin_estimate:
      "Средний чек 150 000-2 000 000 ₽, маржа 15-35% (estimate)",
    LPR: ["генеральный директор", "директор по развитию", "коммерческий директор"],
    pain_triggers: [
      "длинный цикл сделки",
      "много типовых запросов",
      "ручная подготовка КП"
    ],
    why_agentos: [
      "поиск лидов/тендеров",
      "квалификация и КП",
      "follow-ups и отчеты"
    ],
    recommended_entry_offer:
      "5-7 дней: авто-скрининг лидов + шаблоны КП",
    typical_stack: ["CRM", "почта", "таблицы/BI"],
    top_objections: ["длинный цикл внедрения", "слабый ROI", "нет времени"],
    proof_ideas: [
      "первые КП за 48 часов",
      "сокращение времени на пресейл"
    ],
    antiICP: [
      "компании без B2B-цикла и КП",
      "без явного коммерческого процесса",
      "нет входящего потока запросов"
    ],
    minimum_viable_signals: [
      "есть B2B-оффер/услуги",
      "видны типовые запросы/брифы",
      "есть канал для КП/follow-up"
    ]
  },
  {
    key: "local-retail",
    channels: ["OfflineServices"],
    segment_name: "Локальные сети retail/food 3-15 точек",
    avg_check_or_margin_estimate:
      "Средний чек 700-2 500 ₽, маржа 15-30% (estimate)",
    LPR: ["собственник", "операционный директор", "маркетолог"],
    pain_triggers: [
      "нет единой CRM",
      "ручные ответы на отзывы",
      "сложно масштабировать контент"
    ],
    why_agentos: [
      "единый канал заявок",
      "автоответы на отзывы",
      "контент для локальных акций"
    ],
    recommended_entry_offer:
      "3-5 дней: единый канал отзывов + шаблоны ответов",
    typical_stack: ["карты/отзывы", "мессенджеры", "таблицы"],
    top_objections: ["мы маленькая сеть", "нет времени", "нет бюджета"],
    proof_ideas: [
      "рост рейтинга на картах",
      "сокращение времени ответа"
    ],
    antiICP: [
      "точки без отзывов и карточек",
      "бизнесы без повторного спроса",
      "локальные проекты без контактов"
    ],
    minimum_viable_signals: [
      "есть карточки на картах/каталогах",
      "есть отзывы или обращения",
      "есть хотя бы один цифровой канал связи"
    ]
  }
];

const CHANNEL_CATEGORIES = {
  WB: [
    "косметика",
    "товары для дома",
    "детские товары",
    "электроника",
    "одежда",
    "спорт и отдых"
  ],
  Ozon: [
    "уход за домом",
    "красота",
    "детские товары",
    "электроника",
    "одежда",
    "аксессуары"
  ],
  D2C: ["товары для дома", "косметика", "здоровье", "еда и напитки"],
  OfflineServices: ["ремонт", "медицина", "бьюти", "фитнес"],
  B2B: ["логистика", "контрактное производство", "IT-аутсорс", "склад"],
  Mixed: ["косметика", "товары для дома", "детские товары", "логистика"]
};

const SIGNAL_PRESETS = {
  WB: [
    "marketplace_storefront",
    "reviews_200",
    "active_sku",
    "competitive_category",
    "ops_pain"
  ],
  Ozon: [
    "marketplace_storefront",
    "reviews_200",
    "active_sku",
    "competitive_category",
    "ops_pain"
  ],
  D2C: [
    "reviews_200",
    "social_posting",
    "social_engagement",
    "yandex_intent",
    "ops_pain"
  ],
  OfflineServices: [
    "reviews_200",
    "yandex_intent",
    "social_posting",
    "social_engagement",
    "ops_pain"
  ],
  B2B: ["reviews_200", "yandex_intent", "ops_pain", "social_posting"],
  Mixed: ["yandex_intent", "social_posting", "ops_pain"]
};

const INTENT_KEYWORDS = ["купить", "доставка", "оптом", "поставщик", "цена"];
const SERVICE_KEYWORDS = [
  "ремонт",
  "клиник",
  "мед",
  "бьюти",
  "салон",
  "фитнес",
  "услуг",
  "запись",
  "стоматолог",
  "ветеринар"
];
const B2B_KEYWORDS = [
  "логист",
  "производ",
  "аутсорс",
  "b2b",
  "тендер",
  "контракт",
  "склад",
  "опт"
];
const OPS_KEYWORDS = [
  "crm",
  "заявк",
  "колл-центр",
  "коллцентр",
  "логист",
  "доставк",
  "контент",
  "поддержк",
  "чат",
  "заказ",
  "обработка"
];

const buildSegments = (input) => {
  const geo = input.geo && input.geo.trim() ? input.geo.trim() : "Россия";
  let segments = segmentTemplates;
  if (input.channel && input.channel !== "Mixed") {
    const filtered = segmentTemplates.filter((segment) =>
      segment.channels.includes(input.channel)
    );
    if (filtered.length > 0) {
      segments = filtered;
    }
  }
  return segments.slice(0, 6).map((segment) => ({
    segment_name: segment.segment_name,
    geo,
    avg_check_or_margin_estimate: segment.avg_check_or_margin_estimate,
    LPR: segment.LPR,
    pain_triggers: segment.pain_triggers,
    why_agentos: segment.why_agentos,
    recommended_entry_offer: segment.recommended_entry_offer,
    typical_stack: segment.typical_stack,
    top_objections: segment.top_objections,
    proof_ideas: segment.proof_ideas,
    antiICP: segment.antiICP,
    minimum_viable_signals: segment.minimum_viable_signals
  }));
};

const buildSearchQuery = (channel, category, geo) => {
  const geoPart = geo ? ` ${geo}` : "";
  if (channel === "WB") {
    return `site:wildberries.ru ${category}${geoPart} отзывы 200+ бренд`;
  }
  if (channel === "Ozon") {
    return `site:ozon.ru ${category}${geoPart} бренд каталог отзывы`;
  }
  if (channel === "D2C") {
    return `${category}${geoPart} официальный сайт бренд отзывы`;
  }
  if (channel === "OfflineServices") {
    return `${category}${geoPart} услуги отзывы запись`;
  }
  if (channel === "B2B") {
    return `${category}${geoPart} поставщик услуги для бизнеса`;
  }
  return `${category}${geoPart} бренд отзывы`;
};

const pickTopSignals = (signalKeys) => {
  return [...new Set(signalKeys)]
    .map((key) => ({ key, weight: SIGNAL_LIBRARY[key]?.weight ?? 0 }))
    .sort((a, b) => b.weight - a.weight)
    .map((item) => item.key)
    .slice(0, 3);
};

const buildSignalNotes = (signalKeys) => {
  const signals = signalKeys.map((key) => SIGNAL_LIBRARY[key]?.label).filter(Boolean);
  return {
    why_here: `Критерии: ${signals.slice(0, 3).join("; ")}.`,
    source_notes: `Публичные сигналы для проверки: ${signals.slice(0, 3).join("; ")}.`
  };
};

const buildCandidate = ({
  channel,
  segmentName,
  category,
  geo,
  signalKeys,
  confidenceWeights,
  first_offer,
  expected_outcome,
  required_access,
  next_step_message_angle
}) => {
  const signals = pickTopSignals(signalKeys);
  const fitScore = scoreFit(signals, channel, segmentName);
  const painScore = scorePain(signals);
  const signalStrength = scoreSignalStrength(signals);
  const confidence = scoreConfidence(
    fitScore,
    painScore,
    signalStrength,
    confidenceWeights
  );
  const searchQuery = buildSearchQuery(channel, category, geo);
  const evidence = signals.map((signal) => ({
    url: buildSearchUrl(searchQuery, "yandex"),
    title: "Search template",
    evidence_snippet: clipSnippet(
      `Проверить: ${SIGNAL_LIBRARY[signal]?.label || signal}`,
      160
    ),
    signal_type: signal,
    signal_value: SIGNAL_LIBRARY[signal]?.label || signal
  }));
  const notes = buildWhyHereAndNotes(evidence);
  const namePlaceholder = `${channel} ${category} бренд`;
  return {
    name: "",
    link: "",
    name_placeholder: namePlaceholder,
    search_query: searchQuery,
    channel,
    segment_match: segmentName,
    why_here: notes.why_here,
    why_here_proof_refs: notes.why_here_proof_refs,
    proof_refs: notes.proof_refs,
    confidence,
    confidence_estimate: confidence,
    next_step_message_angle,
    source_notes: notes.source_notes,
    first_offer,
    expected_outcome,
    required_access,
    fit_score: fitScore,
    pain_score: painScore,
    signal_strength: signalStrength,
    estimate: true,
    dedupe_key: normalizeDedupeKey(namePlaceholder, ""),
    source_proof: evidence.slice(0, 3),
    _dedupe_components: {
      domain: "",
      inn: "",
      phone: ""
    }
  };
};

const buildCandidates = (segments, input, limit) => {
  const candidates = [];
  const excludeKeys = new Set(
    (input.exclude_list || []).map((item) => normalizeDedupeKey(item, item))
  );
  const channels = input.channel === "Mixed"
    ? ["WB", "Ozon", "D2C", "OfflineServices", "B2B"]
    : [input.channel];

  const geo = input.geo && input.geo.trim() ? input.geo.trim() : "";
  const targetCount = typeof limit === "number" ? limit : input.target_count;
  const nicheOverride = input.industry_or_niche && input.industry_or_niche.trim()
    ? input.industry_or_niche.trim()
    : "";

  let index = 0;
  while (candidates.length < targetCount && index < 80) {
    const channel = channels[index % channels.length];
    const segment = segments[index % segments.length];
    const categoryPool = CHANNEL_CATEGORIES[channel] || CHANNEL_CATEGORIES.Mixed;
    const category = nicheOverride || categoryPool[index % categoryPool.length];
    const signalPreset = SIGNAL_PRESETS[channel] || SIGNAL_PRESETS.Mixed;

    const candidate = buildCandidate({
      channel,
      segmentName: segment.segment_name,
      category,
      geo,
      signalKeys: signalPreset,
      confidenceWeights: input.confidence_weights,
      first_offer: segment.recommended_entry_offer,
      expected_outcome: "Сокращение времени ответа и рост конверсии на 10-25% (estimate)",
      required_access:
        channel === "B2B"
          ? "CRM, почта, шаблоны КП, список услуг"
          : channel === "OfflineServices"
            ? "заявки/расписание, мессенджеры, отзывы"
            : channel === "D2C"
              ? "CRM, сайт, мессенджеры/почта"
              : "кабинет маркетплейса, отзывы, карточки SKU",
      next_step_message_angle:
        "Предложить быстрый пилот на 3-7 дней и показать измеримый результат."
    });

    const dedupeKey = candidate.dedupe_key;
    if (!dedupeKey || excludeKeys.has(dedupeKey) || isAggregator(candidate.name_placeholder)) {
      index += 1;
      continue;
    }

    excludeKeys.add(dedupeKey);
    candidates.push(candidate);
    index += 1;
  }

  return candidates;
};

const applyLastRun = (input, lastRun, options) => {
  const enriched = { ...input };
  if (!lastRun || typeof lastRun !== "object") return enriched;

  const lastData = unwrapLegacy(lastRun);
  const prevCandidates = Array.isArray(lastData.company_candidates)
    ? lastData.company_candidates
    : [];
  const prevKeys = prevCandidates
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const name = item.name || item.name_placeholder || "";
      const link = item.link || "";
      const key = item.dedupe_key || normalizeDedupeKey(name, link);
      return key;
    })
    .filter(Boolean);
  const prevLinks = prevCandidates
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      return typeof item.link === "string" ? item.link : "";
    })
    .filter(Boolean);

  const shouldRefresh = input.mode === "refresh" || input.exclude_list.length === 0;
  if (shouldRefresh) {
    enriched.exclude_list = [
      ...new Set([...enriched.exclude_list, ...prevKeys, ...prevLinks])
    ];
  }

  if (options && options.continue) {
    const prevCount = prevCandidates.length;
    const desiredTotal =
      typeof enriched.target_count === "number" && enriched.target_count > 0
        ? enriched.target_count
        : prevCount + 20;
    const additional = Math.max(1, desiredTotal - prevCount);
    enriched.target_count = additional;
    enriched.exclude_list = [
      ...new Set([...enriched.exclude_list, ...prevKeys, ...prevLinks])
    ];
  }

  return enriched;
};

const buildSearchTemplates = (input) => {
  const niche = input.industry_or_niche || "товары";
  const geo = input.geo || "Россия";
  const marketplaceQueries = [
    `site:wildberries.ru ${niche} бренд`,
    `site:wildberries.ru ${niche} отзывы 200+`,
    `site:ozon.ru ${niche} бренд`,
    `site:ozon.ru ${niche} отзывы 200+`,
    `wildberries ${niche} новинки`,
    `ozon ${niche} популярные`
  ];

  const yandexQueries = [
    `${niche} ${geo} купить`,
    `${niche} ${geo} доставка`,
    `${niche} оптом поставщик`,
    `${niche} цена`,
    `${niche} официальный сайт`,
    `${niche} отзывы`,
    `поставщик ${niche} ${geo}`,
    `дистрибьютор ${niche}`,
    `${niche} контрактное производство`,
    `${niche} b2b услуги`
  ];

  const vkTgQueries = [
    `site:vk.com ${niche} бренд`,
    `site:vk.com ${niche} услуги`,
    `site:vk.com ${niche} отзывы`,
    `site:t.me ${niche} канал`,
    `site:t.me ${niche} бренд`,
    `${niche} скидки VK`,
    `${niche} акции Telegram`,
    `${niche} оптом VK`
  ];

  return { marketplaceQueries, yandexQueries, vkTgQueries };
};

const buildFallbackQueries = (input) => {
  const niche = input.industry_or_niche || "товары";
  const geo = input.geo || "Россия";
  return [
    `site:ozon.ru ${niche} бренд`,
    `site:wildberries.ru ${niche} бренд`,
    `site:vk.com ${niche} магазин ${geo}`,
    `site:t.me ${niche} магазин`,
    `${niche} ${geo} официальный сайт`,
    `${niche} ${geo} отзывы`
  ];
};

const buildSearchUrl = (query, engine) =>
  engine === "duck"
    ? `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    : `https://yandex.ru/search/?text=${encodeURIComponent(query)}`;

const isIntentQuery = (query) => {
  const lower = query.toLowerCase();
  return INTENT_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const buildSearchPlan = (input, templates) => {
  const plan = [];
  const limit = input.mode === "quick" ? 4 : 7;
  const preferred = new Set(input.preferred_sources);

  const pushQueries = (queries, source) => {
    queries.slice(0, limit).forEach((query) => {
      plan.push({ query, source, engine: "yandex", intent: isIntentQuery(query) });
    });
  };

  if (preferred.has("WB") || preferred.has("Ozon")) {
    pushQueries(templates.marketplaceQueries, "marketplace");
  }
  if (preferred.has("Yandex") || preferred.has("OfficialWebsite") || plan.length === 0) {
    pushQueries(templates.yandexQueries, "yandex");
  }
  if (preferred.has("VK") || preferred.has("Telegram")) {
    pushQueries(templates.vkTgQueries, "social");
  }

  const deduped = [];
  const seen = new Set();
  for (const item of plan) {
    const key = item.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
};

const collectSearchResults = async (webClient, plan, options = {}) => {
  const results = [];
  const limitPerQuery = options.limitPerQuery ?? 4;
  const maxSeeds = options.maxSeeds ?? 80;
  const stats = options.stats;

  for (const item of plan) {
    if (results.length >= maxSeeds) break;
    if (stats) stats.sources_used.yandex += 1;
    try {
      const found = await webClient.search(item.query, item.engine, limitPerQuery);
      found.forEach((result) => {
        results.push({
          ...result,
          query: item.query,
          engine: item.engine,
          intent: item.intent,
          source_url: result.source_url || buildSearchUrl(item.query, item.engine)
        });
      });
    } catch (error) {
      if (error && error.message === "WEB_REQUEST_LIMIT") break;
    }
  }

  return results.slice(0, maxSeeds);
};

const guessChannelFromQuery = (query) => {
  const lower = query.toLowerCase();
  if (B2B_KEYWORDS.some((keyword) => lower.includes(keyword))) return "B2B";
  if (SERVICE_KEYWORDS.some((keyword) => lower.includes(keyword))) return "OfflineServices";
  return "D2C";
};

const deriveChannelFromUrl = (url, input, query) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("wildberries")) return "WB";
    if (host.includes("ozon")) return "Ozon";
    if (input.channel && input.channel !== "Mixed") return input.channel;
    if (host.includes("vk.com") || host.includes("t.me") || host.includes("telegram.me")) {
      return guessChannelFromQuery(query);
    }
    return guessChannelFromQuery(query);
  } catch {
    return input.channel && input.channel !== "Mixed" ? input.channel : "D2C";
  }
};

const classifySource = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("yandex")) return "yandex";
    if (host.includes("wildberries")) return "wb";
    if (host.includes("ozon")) return "ozon";
    if (host.includes("vk.com")) return "vk";
    if (host.includes("t.me") || host.includes("telegram.me")) return "tg";
  } catch {
    // ignore
  }
  return "websites";
};

const pickSegmentMatch = (channel, segments) => {
  if (!segments.length) return "";
  const template = segmentTemplates.find((segment) => segment.channels.includes(channel));
  if (template) {
    const match = segments.find((segment) => segment.segment_name === template.segment_name);
    if (match) return match.segment_name;
  }
  return segments[0].segment_name;
};

const cleanTitle = (title = "") => {
  let name = title.trim();
  if (!name) return "";
  name = name.replace(/\s*[–|-|\|]\s*(Wildberries|Ozon|VK|Telegram).*$/i, "");
  name = name.replace(/\s*[–|-|\|]\s*официальный сайт.*$/i, "");
  name = name.replace(/\s*[–|-|\|]\s*каталог.*$/i, "");
  return name.trim();
};

const sanitizeEvidenceSnippet = (text, max = 160) => sanitizeSnippet(text, max);
const clipSnippet = (text, max = 160) => sanitizeSnippet(text, max);

const findSnippet = (text, regex) => {
  const match = regex.exec(text);
  if (!match || match.index === undefined) return "";
  const start = Math.max(0, match.index - 60);
  const end = Math.min(text.length, match.index + match[0].length + 60);
  return clipSnippet(text.slice(start, end));
};

const extractNumberSignal = (text, regex, minValue) => {
  let match;
  let best = null;
  while ((match = regex.exec(text))) {
    const value = Number(match[1]);
    if (!Number.isFinite(value)) continue;
    if (value >= minValue && (!best || value > best.value)) {
      best = { value, index: match.index, match: match[0] };
    }
  }
  return best;
};

const extractSignalsFromPage = (page, recencyDays = 365) => {
  const signalKeys = new Set();
  const evidence = [];
  const title = page.title || page.url;
  const text = page.text || "";
  const lower = text.toLowerCase();
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - Math.max(0, Math.floor(recencyDays / 365));
  const yearMatches = text.match(/20\\d{2}/g) || [];
  const latestYear = yearMatches.reduce(
    (max, value) => Math.max(max, Number(value)),
    0
  );
  const recencyOk = latestYear === 0 || latestYear >= minYear;

  const addEvidence = (signalType, snippet, signalValue) => {
    if (!snippet) return;
    if (signalKeys.has(signalType)) return;
    signalKeys.add(signalType);
    evidence.push({
      url: page.url,
      title,
      evidence_snippet: clipSnippet(snippet),
      signal_type: signalType,
      signal_value: signalValue
    });
  };

  try {
    const host = new URL(page.url).hostname.toLowerCase();
    if (host.includes("wildberries") || host.includes("ozon")) {
      addEvidence("marketplace_storefront", title || page.url, title || page.url);
    }
  } catch {
    // ignore
  }

  const reviewMatch = extractNumberSignal(
    text,
    /(\d{2,6})\s*(отзыв|reviews?)/gi,
    200
  );
  if (reviewMatch) {
    const snippet = findSnippet(text, new RegExp(reviewMatch.match, "i"));
    addEvidence(
      "reviews_200",
      snippet || `reviews: ${reviewMatch.value}`,
      reviewMatch.value
    );
  }

  const skuMatch = extractNumberSignal(
    text,
    /(\d{2,6})\s*(товар|sku|items|products)/gi,
    50
  );
  if (skuMatch) {
    const snippet = findSnippet(text, new RegExp(skuMatch.match, "i"));
    addEvidence(
      "active_sku",
      snippet || `products: ${skuMatch.value}`,
      skuMatch.value
    );
  } else if (lower.includes("новинк")) {
    addEvidence(
      "active_sku",
      findSnippet(text, /новинк/gi) || "новинки",
      "новинки"
    );
  }

  if (/(популярн|хит|топ продаж|бестселлер)/i.test(text)) {
    addEvidence(
      "competitive_category",
      findSnippet(text, /(популярн|хит|топ продаж|бестселлер)/i),
      "competitive"
    );
  }

  if (
    recencyOk &&
    (/(vk\\.com|t\\.me|telegram\\.me)/i.test(page.url) || lower.includes("подписчик"))
  ) {
    if (/(пост|публикац)/i.test(text) && /(\\d+)\\s*(час|дн|нед)/i.test(text)) {
      addEvidence(
        "social_posting",
        findSnippet(text, /(пост|публикац).{0,40}(\\d+\\s*(час|дн|нед))/i),
        "posts_recent"
      );
    }
    if (/(коммент|реакц|лайк|просмотр|подписчик)/i.test(text)) {
      addEvidence(
        "social_engagement",
        findSnippet(text, /(коммент|реакц|лайк|просмотр|подписчик)/i),
        "engagement"
      );
    }
  }

  const opsKeyword = OPS_KEYWORDS.find((keyword) => lower.includes(keyword));
  if (opsKeyword) {
    addEvidence(
      "ops_pain",
      findSnippet(text, new RegExp(opsKeyword, "i")),
      opsKeyword
    );
  }

  return { signalKeys: [...signalKeys], evidence };
};

const scoreFit = (signalKeys, channel, segmentMatch) => {
  let score = 40;
  if (segmentMatch) score += 10;
  if (signalKeys.includes("ops_pain")) score += 20;
  if (signalKeys.includes("marketplace_storefront") && (channel === "WB" || channel === "Ozon")) {
    score += 10;
  }
  if (signalKeys.includes("social_engagement")) score += 10;
  if (signalKeys.includes("yandex_intent")) score += 5;
  if (signalKeys.includes("social_posting")) score += 5;
  if (signalKeys.includes("reviews_200")) score += 5;
  return Math.min(100, score);
};

const buildWhyHereAndNotes = (evidence) => {
  const indexed = evidence
    .map((item, index) => ({
      index,
      snippet: sanitizeEvidenceSnippet(item.evidence_snippet || "", 160)
    }))
    .filter((item) => isNonEmptyString(item.snippet));
  const whyItems = indexed.slice(0, 2);
  const sourceItems = indexed.slice(0, 3);
  return {
    why_here: whyItems.map((item) => item.snippet).join(" | "),
    source_notes: sourceItems.map((item) => item.snippet).join(" | "),
    why_here_proof_refs: whyItems.map((item) => item.index),
    proof_refs: sourceItems.map((item) => item.index)
  };
};

const buildExpectedOutcome = (channel) => {
  if (channel === "WB" || channel === "Ozon") {
    return "Рост рейтинга карточек и скорости ответа на отзывы на 10-20% (estimate)";
  }
  if (channel === "OfflineServices") {
    return "Сокращение пропущенных заявок и времени ответа на 20-30% (estimate)";
  }
  if (channel === "B2B") {
    return "Сокращение времени пресейла и подготовки КП на 20-35% (estimate)";
  }
  return "Рост конверсии лидов и скорости ответа на 10-25% (estimate)";
};

const buildRequiredAccess = (channel) => {
  if (channel === "B2B") return "CRM, почта, шаблоны КП, список услуг";
  if (channel === "OfflineServices") return "заявки/расписание, мессенджеры, отзывы";
  if (channel === "D2C") return "CRM, сайт, мессенджеры/почта";
  return "кабинет маркетплейса, отзывы, карточки SKU";
};

const buildNextStepAngle = () =>
  "Предложить быстрый пилот на 3-7 дней и показать измеримый результат.";

const buildIntentEvidence = (query, sourceUrl) => ({
  url: sourceUrl,
  title: "Поисковый запрос",
  evidence_snippet: clipSnippet(`intent_query: ${query}`, 160),
  signal_type: "yandex_intent",
  signal_value: query
});

const countSignals = (candidate) => {
  if (candidate && Array.isArray(candidate.source_proof)) {
    return candidate.source_proof.length;
  }
  const collect = (text) =>
    text
      .split(/;|\n|•/)
      .map((item) => item.trim())
      .filter(Boolean);
  return collect(candidate?.why_here || "").length + collect(candidate?.source_notes || "").length;
};

const rankEvidence = (evidence) => {
  return [...evidence].sort((a, b) => {
    const weightA = SIGNAL_LIBRARY[a.signal_type]?.weight ?? 0;
    const weightB = SIGNAL_LIBRARY[b.signal_type]?.weight ?? 0;
    return weightB - weightA;
  });
};

const extractSocialLinks = (html) => {
  if (!html) return [];
  const pattern =
    "https?:\\\\/\\\\/(?:vk\\\\.com|t\\\\.me|telegram\\\\.me)\\\\/[^\\\\s\"']+";
  const regex = new RegExp(pattern, "gi");
  const matches = html.match(regex);
  return matches ? [...new Set(matches)] : [];
};

const extractMarketplaceBrandUrl = (page) => {
  const url = page.url || "";
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (!host.includes("wildberries") && !host.includes("ozon")) return "";
  const html = page.html || "";
  const candidates = [];
  const patterns = [
    new RegExp("href=[\"'](https?:\\\\/\\\\/[^\"']+\\\\/seller\\\\/[^\"']+)[\"']", "gi"),
    new RegExp("href=[\"'](https?:\\\\/\\\\/[^\"']+\\\\/brand\\\\/[^\"']+)[\"']", "gi"),
    new RegExp("href=[\"'](https?:\\\\/\\\\/[^\"']+\\\\/brands?\\\\/[^\"']+)[\"']", "gi")
  ];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(html))) {
      if (match[1]) candidates.push(match[1]);
    }
  });
  const unique = [...new Set(candidates.map((item) => canonicalizeUrl(item)))];
  return unique[0] || "";
};

const buildCandidateFromSeed = async ({ seed, segmentPool, input, webClient, stats }) => {
  if (stats) {
    const sourceType = classifySource(seed.url);
    stats.sources_used[sourceType] += 1;
  }
  const page = await webClient.fetchPage(seed.url);
  if ("blocked" in page) {
    if (stats) {
      const sourceType = classifySource(seed.url);
      stats.blocked_by_source[sourceType] += 1;
    }
    return { rejected: { link: seed.url, reason: "blocked_or_unreachable" } };
  }

  const canonicalMarketplace = extractMarketplaceBrandUrl(page);
  const pageUrl = canonicalMarketplace ? canonicalMarketplace : page.url;
  const extracted = extractSignalsFromPage(page, input.recency_days);
  const evidence = [...extracted.evidence];
  const genericExtract = extractFromHtml(page.html || "", page.url);
  if (genericExtract && Array.isArray(genericExtract.proof_items)) {
    genericExtract.proof_items.forEach((item) => {
      evidence.push({
        url: item.url,
        title: item.signal_value || item.url,
        evidence_snippet: clipSnippet(item.evidence_snippet || "", 160),
        signal_type: item.signal_type || "snippet",
        signal_value: item.signal_value || ""
      });
    });
  }
  const signalKeys = new Set(extracted.signalKeys);

  if (seed.intent) {
    evidence.push(buildIntentEvidence(seed.query, seed.source_url));
    signalKeys.add("yandex_intent");
  }

  if (evidence.length < 2) {
    const socialLinks = extractSocialLinks(page.html);
    if (socialLinks.length > 0) {
      const socialUrl = canonicalizeUrl(socialLinks[0]);
      if (stats) {
        const sourceType = classifySource(socialUrl);
        stats.sources_used[sourceType] += 1;
      }
      const socialPage = await webClient.fetchPage(socialUrl);
      if (!("blocked" in socialPage)) {
        const socialSignals = extractSignalsFromPage(socialPage, input.recency_days);
        socialSignals.evidence.forEach((item) => evidence.push(item));
        socialSignals.signalKeys.forEach((key) => signalKeys.add(key));
      } else if (stats) {
        const sourceType = classifySource(socialUrl);
        stats.blocked_by_source[sourceType] += 1;
        if (!signalKeys.has("social_posting")) {
          signalKeys.add("social_posting");
          evidence.push({
            url: socialUrl,
            title: "Social link",
            evidence_snippet: clipSnippet(`social_link: ${socialUrl}`, 160),
            signal_type: "social_posting",
            signal_value: socialUrl
          });
        }
      }
    }
  }

  const uniqueEvidence = [];
  const seenEvidence = new Set();
  evidence.forEach((item) => {
    const key = `${item.signal_type}:${item.url}`;
    if (seenEvidence.has(key)) return;
    seenEvidence.add(key);
    uniqueEvidence.push(item);
  });

  const rankedEvidence = rankEvidence(uniqueEvidence).slice(0, 4);
  const signalList = rankedEvidence.map((item) => item.signal_type);
  const segmentMatch = seed.segment_match;
  const fitScore = scoreFit(signalList, seed.channel, segmentMatch);
  const painScore = scorePain(signalList);
  const signalStrength = scoreSignalStrength(signalList);
  const confidence = scoreConfidence(
    fitScore,
    painScore,
    signalStrength,
    input.confidence_weights
  );
  const notes = buildWhyHereAndNotes(rankedEvidence);

  let name = cleanTitle(page.title);
  if (!name) {
    try {
      const host = new URL(pageUrl).hostname.replace(/^www\\./, "");
      name = host;
    } catch {
      name = pageUrl;
    }
  }

  if (isAggregator(name)) {
    return { rejected: { name, link: seed.url, reason: "aggregator" } };
  }

  const segmentData = segmentPool.find((segment) => segment.segment_name === segmentMatch);
  const dedupeDomain = extractDomainFromUrl(canonicalizeUrl(pageUrl)) || "";
  const dedupeInn = extractInnFromText(page.text || "");
  const dedupePhone = extractPhoneFromText(page.text || "");

  const candidate = {
    name,
    link: pageUrl,
    channel: seed.channel,
    segment_match: segmentMatch,
    why_here: notes.why_here,
    why_here_proof_refs: notes.why_here_proof_refs,
    proof_refs: notes.proof_refs,
    confidence,
    next_step_message_angle: buildNextStepAngle(),
    source_notes: notes.source_notes,
    first_offer: segmentData?.recommended_entry_offer || "3-7 дней: быстрый пилот",
    expected_outcome: buildExpectedOutcome(seed.channel),
    required_access: buildRequiredAccess(seed.channel),
    dedupe_key: normalizeDedupeKey(name, pageUrl),
    fit_score: fitScore,
    pain_score: painScore,
    signal_strength: signalStrength,
    source_proof: rankedEvidence,
    _signal_keys: signalList,
    _dedupe_components: {
      domain: dedupeDomain,
      inn: dedupeInn,
      phone: dedupePhone
    }
  };

  return { candidate };
};

const generateOutput = async (input, options = {}) => {
  const normalized = applyLastRun(normalizeInput(input), options.last_run, options);
  const segmentPool = buildSegments(normalized);
  const segments = normalized.mode === "targets_only" ? [] : segmentPool;
  const lastData = unwrapLegacy(options.last_run);
  const previousTemplates = lastData && lastData.meta ? lastData.meta.search_templates : null;
  const templates =
    normalized.mode === "continue" && previousTemplates
      ? {
          marketplaceQueries:
            previousTemplates.marketplace_queries || buildSearchTemplates(normalized).marketplaceQueries,
          yandexQueries:
            previousTemplates.yandex_queries || buildSearchTemplates(normalized).yandexQueries,
          vkTgQueries: previousTemplates.vk_tg_queries || buildSearchTemplates(normalized).vkTgQueries
        }
      : buildSearchTemplates(normalized);
  const searchPlan = buildSearchPlan(normalized, templates);
  const searchQueriesBySegment = new Map();
  const addSegmentQuery = (segmentName, query) => {
    if (!segmentName || !query) return;
    if (!searchQueriesBySegment.has(segmentName)) {
      searchQueriesBySegment.set(segmentName, new Set());
    }
    searchQueriesBySegment.get(segmentName).add(query);
  };
  const dedupeReport = {
    scanned_total: 0,
    kept_total: 0,
    removed_total: 0,
    removed_by_domain: 0,
    removed_by_inn: 0,
    removed_by_phone: 0
  };
  const dedupeSeen = {
    domain: new Set(),
    inn: new Set(),
    phone: new Set()
  };
  searchPlan.forEach((item) => {
    const lower = String(item.query || "").toLowerCase();
    let channel = "D2C";
    if (lower.includes("wildberries")) channel = "WB";
    else if (lower.includes("ozon")) channel = "Ozon";
    else channel = guessChannelFromQuery(lower);
    const segmentMatch = pickSegmentMatch(channel, segmentPool);
    addSegmentQuery(segmentMatch, item.query);
  });

  const rejectedCandidates = [];
  const assumptions = [];
  const limitations = [];
  let placeholdersUsed = false;
  const fallbackStrategies = new Set();

  let candidates = [];
  let webStats = {
    requests_made: 0,
    blocked_count: 0,
    errors_count: 0,
    duration_ms: 0,
    sources_used: { yandex: 0, wb: 0, ozon: 0, vk: 0, tg: 0, websites: 0 },
    blocked_by_source: { yandex: 0, wb: 0, ozon: 0, vk: 0, tg: 0, websites: 0 },
    fallback_used: false,
    fallback_strategies_used: [],
    top_errors: [],
    warnings: []
  };

  const excludeKeys = new Set(
    (normalized.exclude_list || []).map((item) => normalizeDedupeKey(item, item))
  );
  const getDedupeComponents = (candidate) => {
    const domain =
      candidate?._dedupe_components?.domain ||
      extractDomainFromUrl(canonicalizeUrl(candidate.link || "")) ||
      "";
    const inn = candidate?._dedupe_components?.inn || "";
    const phone = candidate?._dedupe_components?.phone || "";
    return { domain, inn, phone };
  };
  const findDedupeConflict = (components) => {
    if (components.inn && dedupeSeen.inn.has(components.inn)) return "inn";
    if (components.phone && dedupeSeen.phone.has(components.phone)) return "phone";
    if (components.domain && dedupeSeen.domain.has(components.domain)) return "domain";
    return "";
  };
  const markKeptCandidate = (components) => {
    if (components.domain) dedupeSeen.domain.add(components.domain);
    if (components.inn) dedupeSeen.inn.add(components.inn);
    if (components.phone) dedupeSeen.phone.add(components.phone);
    dedupeReport.kept_total += 1;
  };
  const markRemovedDuplicate = (reason) => {
    dedupeReport.removed_total += 1;
    if (reason === "domain") dedupeReport.removed_by_domain += 1;
    if (reason === "inn") dedupeReport.removed_by_inn += 1;
    if (reason === "phone") dedupeReport.removed_by_phone += 1;
  };

  if (
    normalized.mode !== "segments_only" &&
    normalized.mode !== "seed_only" &&
    normalized.has_web_access &&
    options.webClient
  ) {
    const webClient = options.webClient;
    let searchResults = await collectSearchResults(webClient, searchPlan, {
      limitPerQuery: normalized.mode === "quick" ? 3 : 5,
      maxSeeds: normalized.target_count * 4,
      stats: webStats
    });

    const seeds = [];
    const seedSeen = new Set();
    for (const result of searchResults) {
      if (!result.url || seedSeen.has(result.url)) continue;
      if (/\.(pdf|doc|docx)$/i.test(result.url)) continue;
      const canonical = canonicalizeUrl(result.url);
      const seedKey = normalizeDedupeKey(canonical, canonical);
      if (!seedKey || seedSeen.has(seedKey) || excludeKeys.has(seedKey)) continue;
      seedSeen.add(seedKey);
      const channel = deriveChannelFromUrl(canonical, normalized, result.query || "");
      const segmentMatch = pickSegmentMatch(channel, segmentPool);
      addSegmentQuery(segmentMatch, result.query || "");
      seeds.push({
        url: canonical,
        query: result.query || "",
        intent: Boolean(result.intent),
        source_url: result.source_url || buildSearchUrl(result.query || "", result.engine || "yandex"),
        channel,
        segment_match: segmentMatch
      });
    }

    if (seeds.length < normalized.target_count) {
      const fallbackQueries = buildFallbackQueries(normalized);
      fallbackStrategies.add("site_queries");
      webStats.fallback_used = true;
      webStats.fallback_strategies_used = [...fallbackStrategies];
      const fallbackPlan = fallbackQueries.map((query) => ({
        query,
        source: "fallback",
        engine: "yandex",
        intent: isIntentQuery(query)
      }));
      const fallbackResults = await collectSearchResults(webClient, fallbackPlan, {
        limitPerQuery: 3,
        maxSeeds: normalized.target_count * 2,
        stats: webStats
      });
      searchResults = [...searchResults, ...fallbackResults];
      for (const result of fallbackResults) {
        if (!result.url) continue;
        const canonical = canonicalizeUrl(result.url);
        const seedKey = normalizeDedupeKey(canonical, canonical);
        if (!seedKey || seedSeen.has(seedKey) || excludeKeys.has(seedKey)) continue;
        seedSeen.add(seedKey);
        const channel = deriveChannelFromUrl(canonical, normalized, result.query || "");
        const segmentMatch = pickSegmentMatch(channel, segmentPool);
        addSegmentQuery(segmentMatch, result.query || "");
        seeds.push({
          url: canonical,
          query: result.query || "",
          intent: Boolean(result.intent),
          source_url: result.source_url || buildSearchUrl(result.query || "", result.engine || "yandex"),
          channel,
          segment_match: segmentMatch
        });
      }
    }

    const good = [];
    const lowQuality = [];
    for (const seed of seeds) {
      if (good.length >= normalized.target_count * 2) break;
      const key = normalizeDedupeKey(seed.url, seed.url);
      if (!key || excludeKeys.has(key)) continue;
      const result = await buildCandidateFromSeed({
        seed,
        segmentPool,
        input: normalized,
        webClient,
        stats: webStats
      });
      if (result.rejected) {
        if (rejectedCandidates.length < 10) rejectedCandidates.push(result.rejected);
        continue;
      }
      const candidate = result.candidate;
      dedupeReport.scanned_total += 1;
      const dedupeComponents = getDedupeComponents(candidate);
      const dedupeConflict = findDedupeConflict(dedupeComponents);
      if (!candidate.dedupe_key || excludeKeys.has(candidate.dedupe_key)) {
        markRemovedDuplicate(dedupeConflict || (dedupeComponents.domain ? "domain" : ""));
        if (rejectedCandidates.length < 10) {
          rejectedCandidates.push({
            name: candidate.name,
            link: candidate.link,
            reason: "duplicate_dedupe_key"
          });
        }
        continue;
      }
      if (dedupeConflict) {
        markRemovedDuplicate(dedupeConflict);
        if (rejectedCandidates.length < 10) {
          rejectedCandidates.push({
            name: candidate.name,
            link: candidate.link,
            reason: `duplicate_${dedupeConflict}`
          });
        }
        continue;
      }
      if (normalized.require_signals && candidate.source_proof.length < 2) {
        if (rejectedCandidates.length < 10) {
          rejectedCandidates.push({
            name: candidate.name,
            link: candidate.link,
            reason: "insufficient_signals"
          });
        }
        continue;
      }

      if (candidate.confidence < normalized.min_confidence) {
        candidate.low_quality = true;
        if (normalized.mode === "deep") {
          lowQuality.push(candidate);
          markKeptCandidate(dedupeComponents);
          excludeKeys.add(candidate.dedupe_key);
        } else if (rejectedCandidates.length < 10) {
          rejectedCandidates.push({
            name: candidate.name,
            link: candidate.link,
            reason: "below_min_confidence"
          });
        }
      } else {
        good.push(candidate);
        markKeptCandidate(dedupeComponents);
        excludeKeys.add(candidate.dedupe_key);
      }
    }

    const pool = good.length < normalized.target_count && normalized.mode === "deep"
      ? [...good, ...lowQuality]
      : good;

    candidates = pool
      .map((candidate) => ({
        ...candidate,
        _pain: painStrength(candidate._signal_keys || [])
      }))
      .sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return b._pain - a._pain;
      })
      .slice(0, normalized.target_count)
      .map(({ _pain, _signal_keys, _dedupe_components, ...candidate }) => candidate);

    const clientStats = webClient.getStats();
    webStats = {
      ...webStats,
      requests_made: clientStats.requests_made,
      blocked_count: clientStats.blocked_count,
      errors_count: clientStats.errors_count,
      duration_ms: clientStats.duration_ms,
      top_errors: clientStats.top_errors || [],
      warnings: clientStats.warnings || []
    };
  } else if (normalized.mode !== "segments_only" && normalized.mode !== "seed_only") {
    assumptions.push("Веб-доступ отключен или клиент не настроен.");
  }

  const allowPlaceholders =
    normalized.mode !== "segments_only" &&
    normalized.mode !== "seed_only" &&
    ((normalized.has_web_access && normalized.allow_placeholders_if_blocked) ||
      (!normalized.has_web_access && normalized.allow_placeholders_if_no_web));

  if (
    normalized.mode !== "segments_only" &&
    normalized.mode !== "seed_only" &&
    candidates.length < normalized.target_count &&
    allowPlaceholders
  ) {
    const missing = normalized.target_count - candidates.length;
    if (missing > 0) {
      const placeholderInput = {
        ...normalized,
        exclude_list: [
          ...normalized.exclude_list,
          ...candidates.map((candidate) => candidate.dedupe_key)
        ]
      };
      const placeholderRaw = buildCandidates(segmentPool, placeholderInput, missing).map((item) => ({
        ...item,
        estimate: true,
        confidence_estimate: item.confidence,
        confidence: item.confidence
      }));
      const placeholders = [];
      for (const item of placeholderRaw) {
        dedupeReport.scanned_total += 1;
        addSegmentQuery(item.segment_match, item.search_query);
        const dedupeComponents = getDedupeComponents(item);
        const dedupeConflict = findDedupeConflict(dedupeComponents);
        if (!item.dedupe_key || excludeKeys.has(item.dedupe_key) || dedupeConflict) {
          markRemovedDuplicate(dedupeConflict || (dedupeComponents.domain ? "domain" : ""));
          continue;
        }
        markKeptCandidate(dedupeComponents);
        excludeKeys.add(item.dedupe_key);
        placeholders.push(item);
      }
      candidates = [...candidates, ...placeholders];
      placeholdersUsed = true;
    }
  }

  if (placeholdersUsed) {
    limitations.push("Часть кандидатов — placeholders из-за ограничений веб-доступа.");
  }
  if (webStats.blocked_count > 0) {
    limitations.push("Некоторые источники заблокировали доступ (robots.txt/ограничения).");
  }
  if (webStats.errors_count > 0) {
    limitations.push("Часть запросов завершилась ошибкой сети.");
  }

  if (normalized.mode === "segments_only" || normalized.mode === "seed_only") {
    candidates = [];
  }

  if (normalized.mode === "targets_only") {
    segments.length = 0;
  }

  if (assumptions.length === 0) {
    assumptions.push("Использованы только публичные источники и проверяемые сигналы.");
  }
  if (limitations.length === 0) {
    limitations.push("Выдача зависит от доступности публичных источников.");
  }

  const searchQueriesUsedBySegment = segments.map((segment) => ({
    segment_name: segment.segment_name,
    queries: [...(searchQueriesBySegment.get(segment.segment_name) || new Set())].slice(0, 8)
  }));
  const normalizedCandidates = candidates.map(
    ({ _dedupe_components, _signal_keys, ...candidate }) => candidate
  );
  dedupeReport.kept_total = normalizedCandidates.length;
  dedupeReport.removed_total = Math.max(
    dedupeReport.removed_total,
    dedupeReport.scanned_total - dedupeReport.kept_total
  );

  const legacyOutput = {
    segments,
    company_candidates: normalizedCandidates,
    meta: {
      generated_at: new Date().toISOString(),
      assumptions,
      limitations,
      marketplace_queries: templates.marketplaceQueries,
      yandex_queries: templates.yandexQueries,
      vk_tg_queries: templates.vkTgQueries,
      rejected_candidates: rejectedCandidates.slice(0, 10),
      web_stats: webStats,
      search_templates: {
        marketplace_queries: templates.marketplaceQueries,
        yandex_queries: templates.yandexQueries,
        vk_tg_queries: templates.vkTgQueries
      },
      search_plan: {
        queries_used: searchPlan.map((item) => item.query)
      },
      search_queries_used_by_segment: searchQueriesUsedBySegment,
      dedupe_report: dedupeReport,
      confidence_weights: normalized.confidence_weights,
      next_manual_actions: [
        "Отобрать top-20 кандидатов по confidence и запустить персонализированный outreach.",
        "Проверить вручную кандидатов с low_quality=true и подтвердить сигналы."
      ]
    }
  };

  applyBudgetMeta(legacyOutput.meta, normalized);

  const envelope = wrapAgentOutput({
    agentId: platonAgent.id,
    inputEcho: normalized,
    mode: normalized.mode,
    legacyOutput
  });

  if (normalized.mode === "refresh" && options.last_run) {
    const prevData = unwrapLegacy(options.last_run);
    const prevCandidates = Array.isArray(prevData.company_candidates)
      ? prevData.company_candidates
      : [];
    const prevKeys = new Set(
      prevCandidates
        .map((item) => {
          if (!item || typeof item !== "object") return "";
          const name = item.name || item.name_placeholder || "";
          const link = item.link || "";
          return item.dedupe_key || normalizeDedupeKey(name, link);
        })
        .filter(Boolean)
    );
    const newKeys = new Set(
      candidates
        .map((item) => item.dedupe_key || normalizeDedupeKey(item.name || "", item.link || ""))
        .filter(Boolean)
    );
    const diff = {
      added: [...newKeys].filter((key) => !prevKeys.has(key)),
      removed: [...prevKeys].filter((key) => !newKeys.has(key))
    };
    if (envelope.meta && envelope.meta.handoff && envelope.meta.handoff.entities) {
      envelope.meta.handoff.entities.diff = diff;
    }
  }

  return {
    output: envelope,
    effectiveInput: normalized
  };
};

const generatePlatonOutput = async (rawInput = {}, options = {}) => {
  const result = await generateOutput(rawInput, options);
  return result.output;
};

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isStringArray = (value) =>
  Array.isArray(value) && value.every((item) => isNonEmptyString(item));

const validatePlatonOutput = (payload, options = {}) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;

  const allowEmptySegments = options.mode === "targets_only";
  const allowEmptyCandidates = options.mode === "segments_only" || options.mode === "seed_only";

  if (!Array.isArray(payload.segments)) {
    errors.push("segments must be an array.");
  } else {
    if (!allowEmptySegments) {
      if (payload.segments.length < 5 || payload.segments.length > 8) {
        errors.push("segments length must be between 5 and 8.");
      }
    } else if (payload.segments.length !== 0 && payload.segments.length < 5) {
      errors.push("segments length must be 0 or 5-8.");
    }
    const segmentNames = new Set();
    payload.segments.forEach((segment, index) => {
      if (!segment || typeof segment !== "object") {
        errors.push(`segments[${index}] must be an object.`);
        return;
      }
      if (!isNonEmptyString(segment.segment_name)) {
        errors.push(`segments[${index}].segment_name is required.`);
      } else if (segmentNames.has(segment.segment_name)) {
        errors.push(`segments[${index}].segment_name must be unique.`);
      } else {
        segmentNames.add(segment.segment_name);
      }
      if (!isNonEmptyString(segment.geo)) {
        errors.push(`segments[${index}].geo is required.`);
      }
      if (!isNonEmptyString(segment.avg_check_or_margin_estimate)) {
        errors.push(`segments[${index}].avg_check_or_margin_estimate is required.`);
      } else if (!segment.avg_check_or_margin_estimate.includes("estimate")) {
        errors.push(`segments[${index}].avg_check_or_margin_estimate must include "estimate".`);
      }
      if (!isStringArray(segment.LPR) || segment.LPR.length < 1) {
        errors.push(`segments[${index}].LPR must be a non-empty array.`);
      }
      if (!isStringArray(segment.pain_triggers)) {
        errors.push(`segments[${index}].pain_triggers must be an array.`);
      } else if (
        segment.pain_triggers.length < 3 ||
        segment.pain_triggers.length > 6
      ) {
        errors.push(`segments[${index}].pain_triggers length must be 3-6.`);
      }
      if (!isStringArray(segment.why_agentos)) {
        errors.push(`segments[${index}].why_agentos must be an array.`);
      } else if (segment.why_agentos.length < 2 || segment.why_agentos.length > 4) {
        errors.push(`segments[${index}].why_agentos length must be 2-4.`);
      }
      if (!isNonEmptyString(segment.recommended_entry_offer)) {
        errors.push(`segments[${index}].recommended_entry_offer is required.`);
      }
      if (!isStringArray(segment.typical_stack) || segment.typical_stack.length < 1) {
        errors.push(`segments[${index}].typical_stack is required.`);
      }
      if (!isStringArray(segment.top_objections) || segment.top_objections.length < 3) {
        errors.push(`segments[${index}].top_objections is required.`);
      }
      if (!isStringArray(segment.proof_ideas) || segment.proof_ideas.length < 1) {
        errors.push(`segments[${index}].proof_ideas is required.`);
      }
      if (!isStringArray(segment.antiICP) || segment.antiICP.length < 1) {
        errors.push(`segments[${index}].antiICP is required.`);
      }
      if (!isStringArray(segment.minimum_viable_signals)) {
        errors.push(`segments[${index}].minimum_viable_signals must be an array.`);
      } else if (
        segment.minimum_viable_signals.length < 2 ||
        segment.minimum_viable_signals.length > 3
      ) {
        errors.push(`segments[${index}].minimum_viable_signals length must be 2-3.`);
      }
    });
  }

  if (!Array.isArray(payload.company_candidates)) {
    errors.push("company_candidates must be an array.");
  } else {
    if (!allowEmptyCandidates) {
      if (payload.company_candidates.length < 15 || payload.company_candidates.length > 40) {
        errors.push("company_candidates length must be between 15 and 40.");
      }
    } else if (payload.company_candidates.length !== 0 && payload.company_candidates.length < 15) {
      errors.push("company_candidates length must be 0 or >= 15.");
    }

    const candidateNames = new Set();
    payload.company_candidates.forEach((candidate, index) => {
      if (!candidate || typeof candidate !== "object") {
        errors.push(`company_candidates[${index}] must be an object.`);
        return;
      }
      const hasName = isNonEmptyString(candidate.name) || isNonEmptyString(candidate.link);
      const hasPlaceholder =
        isNonEmptyString(candidate.name_placeholder) &&
        isNonEmptyString(candidate.search_query);
      if (!hasName && !hasPlaceholder) {
        errors.push(
          `company_candidates[${index}] must include name/link or placeholder fields.`
        );
      }
      if (!isNonEmptyString(candidate.channel)) {
        errors.push(`company_candidates[${index}].channel is required.`);
      }
      if (!isNonEmptyString(candidate.segment_match)) {
        errors.push(`company_candidates[${index}].segment_match is required.`);
      }
      if (!isNonEmptyString(candidate.why_here)) {
        errors.push(`company_candidates[${index}].why_here is required.`);
      }
      if (
        typeof candidate.confidence !== "number" ||
        candidate.confidence < 0 ||
        candidate.confidence > 100
      ) {
        errors.push(`company_candidates[${index}].confidence must be 0-100.`);
      }
      if (!isNonEmptyString(candidate.next_step_message_angle)) {
        errors.push(`company_candidates[${index}].next_step_message_angle is required.`);
      }
      if (!isNonEmptyString(candidate.source_notes)) {
        errors.push(`company_candidates[${index}].source_notes is required.`);
      }
      if (!isNonEmptyString(candidate.first_offer)) {
        errors.push(`company_candidates[${index}].first_offer is required.`);
      }
      if (!isNonEmptyString(candidate.expected_outcome)) {
        errors.push(`company_candidates[${index}].expected_outcome is required.`);
      } else if (!candidate.expected_outcome.includes("estimate")) {
        errors.push(`company_candidates[${index}].expected_outcome must include estimate.`);
      }
      if (!isNonEmptyString(candidate.required_access)) {
        errors.push(`company_candidates[${index}].required_access is required.`);
      }
      if (!isNonEmptyString(candidate.dedupe_key)) {
        errors.push(`company_candidates[${index}].dedupe_key is required.`);
      }
      if (
        typeof candidate.fit_score !== "number" ||
        candidate.fit_score < 0 ||
        candidate.fit_score > 100
      ) {
        errors.push(`company_candidates[${index}].fit_score must be 0-100.`);
      }
      if (
        typeof candidate.pain_score !== "number" ||
        candidate.pain_score < 0 ||
        candidate.pain_score > 100
      ) {
        errors.push(`company_candidates[${index}].pain_score must be 0-100.`);
      }
      if (
        typeof candidate.signal_strength !== "number" ||
        candidate.signal_strength < 0 ||
        candidate.signal_strength > 100
      ) {
        errors.push(`company_candidates[${index}].signal_strength must be 0-100.`);
      }
      if (!Array.isArray(candidate.source_proof) || candidate.source_proof.length === 0) {
        errors.push(`company_candidates[${index}].source_proof is required.`);
      } else {
        if (candidate.source_proof.length > 4) {
          errors.push(`company_candidates[${index}].source_proof max length is 4.`);
        }
        candidate.source_proof.forEach((proof, proofIndex) => {
          if (!proof || typeof proof !== "object") {
            errors.push(`company_candidates[${index}].source_proof[${proofIndex}] invalid.`);
            return;
          }
          if (!isNonEmptyString(proof.url)) {
            errors.push(`company_candidates[${index}].source_proof[${proofIndex}].url required.`);
          }
          if (!isNonEmptyString(proof.title)) {
            errors.push(`company_candidates[${index}].source_proof[${proofIndex}].title required.`);
          }
          if (!isNonEmptyString(proof.evidence_snippet)) {
            errors.push(
              `company_candidates[${index}].source_proof[${proofIndex}].evidence_snippet required.`
            );
          }
          if (!isNonEmptyString(proof.signal_type)) {
            errors.push(
              `company_candidates[${index}].source_proof[${proofIndex}].signal_type required.`
            );
          }
          if (
            proof.signal_value !== undefined &&
            typeof proof.signal_value !== "string" &&
            typeof proof.signal_value !== "number"
          ) {
            errors.push(
              `company_candidates[${index}].source_proof[${proofIndex}].signal_value must be string or number.`
            );
          }
        });
      }
      if (!Array.isArray(candidate.proof_refs) || candidate.proof_refs.length === 0) {
        errors.push(`company_candidates[${index}].proof_refs is required.`);
      }
      if (!Array.isArray(candidate.why_here_proof_refs) || candidate.why_here_proof_refs.length === 0) {
        errors.push(`company_candidates[${index}].why_here_proof_refs is required.`);
      } else if (candidate.why_here_proof_refs.length > 2) {
        errors.push(`company_candidates[${index}].why_here_proof_refs max length is 2.`);
      }
      if (Array.isArray(candidate.why_here_proof_refs) && Array.isArray(candidate.source_proof)) {
        candidate.why_here_proof_refs.forEach((ref, refIndex) => {
          if (
            typeof ref !== "number" ||
            ref < 0 ||
            ref >= candidate.source_proof.length
          ) {
            errors.push(
              `company_candidates[${index}].why_here_proof_refs[${refIndex}] invalid index.`
            );
          }
        });
      }
      if (Array.isArray(candidate.proof_refs) && Array.isArray(candidate.source_proof)) {
        candidate.proof_refs.forEach((ref, refIndex) => {
          if (
            typeof ref !== "number" ||
            ref < 0 ||
            ref >= candidate.source_proof.length
          ) {
            errors.push(`company_candidates[${index}].proof_refs[${refIndex}] invalid index.`);
          }
        });
      }
      if (isNonEmptyString(candidate.why_here) && (!Array.isArray(candidate.why_here_proof_refs) || candidate.why_here_proof_refs.length === 0)) {
        errors.push(`company_candidates[${index}] why_here must reference proof refs.`);
      }

      if (options.require_signals) {
        if (countSignals(candidate) < 2) {
          errors.push(`company_candidates[${index}] must include 2+ signals.`);
        }
      }

      if (options.min_confidence && !candidate.low_quality) {
        if (candidate.confidence < options.min_confidence) {
          errors.push(`company_candidates[${index}] below min_confidence.`);
        }
      }

      const key = candidate.dedupe_key ||
        (hasPlaceholder ? `placeholder:${candidate.name_placeholder}` : `name:${candidate.name}`);
      if (candidateNames.has(key)) {
        errors.push(`company_candidates[${index}] duplicate candidate detected.`);
      } else {
        candidateNames.add(key);
      }
    });
  }

  if (!payload.meta || typeof payload.meta !== "object") {
    errors.push("meta must be an object.");
  } else {
    if (!isNonEmptyString(payload.meta.generated_at)) {
      errors.push("meta.generated_at is required.");
    }
    if (!isStringArray(payload.meta.assumptions)) {
      errors.push("meta.assumptions must be a string array.");
    }
    if (!isStringArray(payload.meta.limitations)) {
      errors.push("meta.limitations must be a string array.");
    }
    if (!isStringArray(payload.meta.marketplace_queries)) {
      errors.push("meta.marketplace_queries must be a string array.");
    }
    if (!isStringArray(payload.meta.yandex_queries)) {
      errors.push("meta.yandex_queries must be a string array.");
    }
    if (!isStringArray(payload.meta.vk_tg_queries)) {
      errors.push("meta.vk_tg_queries must be a string array.");
    }
    if (!Array.isArray(payload.meta.rejected_candidates)) {
      errors.push("meta.rejected_candidates must be an array.");
    } else {
      payload.meta.rejected_candidates.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          errors.push(`meta.rejected_candidates[${index}] must be an object.`);
          return;
        }
        if (!isNonEmptyString(item.reason)) {
          errors.push(`meta.rejected_candidates[${index}].reason is required.`);
        }
      });
    }
    if (!payload.meta.web_stats || typeof payload.meta.web_stats !== "object") {
      errors.push("meta.web_stats must be an object.");
    } else {
      const stats = payload.meta.web_stats;
      if (typeof stats.requests_made !== "number") {
        errors.push("meta.web_stats.requests_made must be a number.");
      }
      if (typeof stats.blocked_count !== "number") {
        errors.push("meta.web_stats.blocked_count must be a number.");
      }
      if (typeof stats.errors_count !== "number") {
        errors.push("meta.web_stats.errors_count must be a number.");
      }
      if (typeof stats.duration_ms !== "number") {
        errors.push("meta.web_stats.duration_ms must be a number.");
      }
      const sources = stats.sources_used;
      if (!sources || typeof sources !== "object") {
        errors.push("meta.web_stats.sources_used must be an object.");
      }
      const blocked = stats.blocked_by_source;
      if (!blocked || typeof blocked !== "object") {
        errors.push("meta.web_stats.blocked_by_source must be an object.");
      }
      if (typeof stats.fallback_used !== "boolean") {
        errors.push("meta.web_stats.fallback_used must be boolean.");
      }
      if (!Array.isArray(stats.fallback_strategies_used)) {
        errors.push("meta.web_stats.fallback_strategies_used must be array.");
      }
      if (!Array.isArray(stats.top_errors)) {
        errors.push("meta.web_stats.top_errors must be array.");
      }
      if (!Array.isArray(stats.warnings)) {
        errors.push("meta.web_stats.warnings must be array.");
      }
    }
    if (!payload.meta.search_templates || typeof payload.meta.search_templates !== "object") {
      errors.push("meta.search_templates must be an object.");
    } else {
      const templates = payload.meta.search_templates;
      if (!isStringArray(templates.marketplace_queries)) {
        errors.push("meta.search_templates.marketplace_queries must be a string array.");
      }
      if (!isStringArray(templates.yandex_queries)) {
        errors.push("meta.search_templates.yandex_queries must be a string array.");
      }
      if (!isStringArray(templates.vk_tg_queries)) {
        errors.push("meta.search_templates.vk_tg_queries must be a string array.");
      }
    }
    if (!payload.meta.search_plan || typeof payload.meta.search_plan !== "object") {
      errors.push("meta.search_plan must be an object.");
    } else if (!isStringArray(payload.meta.search_plan.queries_used)) {
      errors.push("meta.search_plan.queries_used must be a string array.");
    }
    if (!Array.isArray(payload.meta.search_queries_used_by_segment)) {
      errors.push("meta.search_queries_used_by_segment must be an array.");
    } else {
      payload.meta.search_queries_used_by_segment.forEach((item, index) => {
        if (!item || typeof item !== "object") {
          errors.push(`meta.search_queries_used_by_segment[${index}] must be an object.`);
          return;
        }
        if (!isNonEmptyString(item.segment_name)) {
          errors.push(
            `meta.search_queries_used_by_segment[${index}].segment_name is required.`
          );
        }
        if (!isStringArray(item.queries)) {
          errors.push(`meta.search_queries_used_by_segment[${index}].queries must be an array.`);
        }
      });
    }
    if (!payload.meta.dedupe_report || typeof payload.meta.dedupe_report !== "object") {
      errors.push("meta.dedupe_report must be an object.");
    } else {
      const report = payload.meta.dedupe_report;
      const requiredNumberFields = [
        "scanned_total",
        "kept_total",
        "removed_total",
        "removed_by_domain",
        "removed_by_inn",
        "removed_by_phone"
      ];
      requiredNumberFields.forEach((field) => {
        if (typeof report[field] !== "number") {
          errors.push(`meta.dedupe_report.${field} must be a number.`);
        }
      });
    }
    if (payload.meta.confidence_weights !== undefined) {
      const weights = payload.meta.confidence_weights;
      if (!weights || typeof weights !== "object") {
        errors.push("meta.confidence_weights must be an object.");
      } else {
        ["fit_score", "pain_score", "signal_strength"].forEach((field) => {
          if (typeof weights[field] !== "number") {
            errors.push(`meta.confidence_weights.${field} must be a number.`);
          }
        });
      }
    }
    if (!isStringArray(payload.meta.next_manual_actions)) {
      errors.push("meta.next_manual_actions must be a string array.");
    }
  }

  return { valid: errors.length === 0, errors };
};

module.exports = {
  DEFAULT_WHAT_WE_SELL,
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  platonAgent,
  normalizeInput,
  generatePlatonOutput,
  validatePlatonOutput,
  generateOutput
};
