const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const {
  extractDomainFromUrl,
  normalizePhone,
  normalizeEmail,
  makeDedupeKey
} = require("../../utils/normalize.js");
const { extractFromHtml } = require("../../extractors");

const DEFAULT_QUERY_CONTEXT = "AgentOS — локальные лиды через публичные карты/каталоги";

const inputDefaults = {
  mode: "deep",
  has_web_access: true,
  max_web_requests: null,
  source: "multi",
  query: "",
  geo: "",
  radius_hint: "",
  min_branches: 2,
  min_reviews: 20,
  min_rating: 4.2,
  signals: {
    ads_or_visibility: true,
    reputation_pain: true,
    scheduling_pain: true
  },
  lead_quality_gate: {
    min_contactability: 1,
    min_pain_or_growth_signals: 2
  },
  enrichment_minimal: true,
  target_count: null,
  require_proof: true,
  allow_placeholders_if_blocked: true,
  exclude_domains: [],
  exclude_names: [],
  dedupe_by: "mixed"
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep", "continue", "refresh"], default: "deep" },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    source: {
      type: "string",
      enum: ["yandex_maps", "2gis", "avito", "catalogs", "multi"],
      default: "multi"
    },
    query: { type: "string" },
    geo: { type: "string" },
    radius_hint: { type: "string" },
    min_branches: { type: "number", default: 2 },
    min_reviews: { type: "number" },
    min_rating: { type: "number" },
    signals: {
      type: "object",
      properties: {
        ads_or_visibility: { type: "boolean", default: true },
        reputation_pain: { type: "boolean", default: true },
        scheduling_pain: { type: "boolean", default: true }
      }
    },
    lead_quality_gate: {
      type: "object",
      properties: {
        min_contactability: { type: "number", default: 1 },
        min_pain_or_growth_signals: { type: "number", default: 2 }
      }
    },
    enrichment_minimal: { type: "boolean", default: true },
    target_count: { type: "number" },
    require_proof: { type: "boolean", default: true },
    allow_placeholders_if_blocked: { type: "boolean", default: true },
    exclude_domains: { type: "array", items: { type: "string" } },
    exclude_names: { type: "array", items: { type: "string" } },
    dedupe_by: {
      type: "string",
      enum: ["domain", "phone", "name_city", "mixed"],
      default: "mixed"
    }
  },
  required: ["mode", "has_web_access"],
  default: inputDefaults
};

const outputSchema = {
  type: "object",
  required: ["leads", "meta"],
  additionalProperties: false,
  properties: {
    leads: { type: "array" },
    meta: { type: "object" }
  }
};

const systemPrompt = `Ты — ИИ-агент agentOS: "Максим — Локальные лиды".
Роль: собирать локальные лиды из публичных карточек (Яндекс Карты/2GIS/каталоги/Avito) без серого парсинга.
Никаких обходов капчи/скрытых API. Только видимые данные.`;

const maximAgent = {
  id: "maxim-local-leads-ru",
  displayName: "Максим — Локальные лиды",
  description:
    "Собирает локальные лиды из публичных карточек карт/каталогов с доказательствами.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: maximAgent.id,
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

const resolveTargetCount = (mode, targetCount) => {
  if (typeof targetCount === "number" && Number.isFinite(targetCount) && targetCount > 0) {
    return Math.round(targetCount);
  }
  return mode === "quick" ? 20 : 50;
};

const normalizeInput = (input) => {
  const safe = typeof input === "object" && input !== null ? input : {};
  const budget = safe.budget && typeof safe.budget === "object" ? safe.budget : null;
  const mode =
    safe.mode === "quick" || safe.mode === "continue" || safe.mode === "refresh"
      ? safe.mode
      : "deep";
  const normalized = {
    mode,
    has_web_access: typeof safe.has_web_access === "boolean" ? safe.has_web_access : true,
    max_web_requests: resolveMaxRequests(mode, safe.max_web_requests),
    source: ["yandex_maps", "2gis", "avito", "catalogs", "multi"].includes(safe.source)
      ? safe.source
      : "multi",
    query: typeof safe.query === "string" ? safe.query.trim() : "",
    geo: typeof safe.geo === "string" ? safe.geo.trim() : "",
    radius_hint: typeof safe.radius_hint === "string" ? safe.radius_hint.trim() : "",
    min_branches:
      typeof safe.min_branches === "number" && Number.isFinite(safe.min_branches)
        ? safe.min_branches
        : 2,
    min_reviews:
      typeof safe.min_reviews === "number" && Number.isFinite(safe.min_reviews)
        ? safe.min_reviews
        : 20,
    min_rating:
      typeof safe.min_rating === "number" && Number.isFinite(safe.min_rating)
        ? safe.min_rating
        : 4.2,
    signals: {
      ads_or_visibility:
        typeof safe.signals?.ads_or_visibility === "boolean"
          ? safe.signals.ads_or_visibility
          : true,
      reputation_pain:
        typeof safe.signals?.reputation_pain === "boolean"
          ? safe.signals.reputation_pain
          : true,
      scheduling_pain:
        typeof safe.signals?.scheduling_pain === "boolean"
          ? safe.signals.scheduling_pain
          : true
    },
    lead_quality_gate: {
      min_contactability:
        typeof safe.lead_quality_gate?.min_contactability === "number" &&
        Number.isFinite(safe.lead_quality_gate.min_contactability)
          ? Math.max(0, Math.round(safe.lead_quality_gate.min_contactability))
          : 1,
      min_pain_or_growth_signals:
        typeof safe.lead_quality_gate?.min_pain_or_growth_signals === "number" &&
        Number.isFinite(safe.lead_quality_gate.min_pain_or_growth_signals)
          ? Math.max(1, Math.round(safe.lead_quality_gate.min_pain_or_growth_signals))
          : 2
    },
    enrichment_minimal: safe.enrichment_minimal !== false,
    target_count: resolveTargetCount(mode, safe.target_count),
    require_proof: typeof safe.require_proof === "boolean" ? safe.require_proof : true,
    allow_placeholders_if_blocked:
      typeof safe.allow_placeholders_if_blocked === "boolean"
        ? safe.allow_placeholders_if_blocked
        : true,
    exclude_domains: Array.isArray(safe.exclude_domains)
      ? safe.exclude_domains.filter((item) => typeof item === "string" && item.trim())
      : [],
    exclude_names: Array.isArray(safe.exclude_names)
      ? safe.exclude_names.filter((item) => typeof item === "string" && item.trim())
      : [],
    dedupe_by: ["domain", "phone", "name_city", "mixed"].includes(safe.dedupe_by)
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
  const geo = input.geo || "";
  const query = input.query || "";
  const radius = input.radius_hint ? ` ${input.radius_hint}` : "";

  const base = `${query} ${geo}${radius}`.trim();
  if (!base) return [];

  const include = (source) => input.source === "multi" || input.source === source;

  if (include("yandex_maps")) {
    queries.push(`${base} яндекс карты`);
    queries.push(`site:yandex.ru/maps ${base}`);
  }
  if (include("2gis")) {
    queries.push(`${base} 2gis`);
    queries.push(`site:2gis.ru ${base}`);
  }
  if (include("avito")) {
    queries.push(`site:avito.ru ${query} услуги ${geo}`.trim());
  }
  if (include("catalogs")) {
    queries.push(`каталог ${base}`);
    queries.push(`справочник ${base}`);
  }

  return [...new Set(queries.filter(Boolean))];
};

const sourceTypeForUrl = (url, input) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("yandex") && url.includes("/maps")) return "yandex_maps";
    if (host.includes("2gis")) return "2gis";
    if (host.includes("avito")) return "avito";
    return input.source === "catalogs" ? "catalog" : "website";
  } catch {
    return "website";
  }
};

const isLikelyBadSeed = (url) => {
  return /top-10|топ-10|рейтинги|лучшие|статья|blog|news/i.test(url);
};

const extractLeadFields = (page, input) => {
  const title = page.title || "";
  const text = page.text || "";
  const lower = text.toLowerCase();

  const name = title.split("|")[0].split("—")[0].trim() || input.query || "";

  const ratingMatch = text.match(/(\d\.\d)\s*(рейтинг|rating)/i);
  const rating = ratingMatch ? Number(ratingMatch[1]) : null;

  const reviewsMatch = text.match(/(\d{1,6})\s*(отзыв|reviews?)/i);
  const reviews_count = reviewsMatch ? Number(reviewsMatch[1]) : null;

  const phoneMatch = text.match(/(\+7|8)\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g);
  const phone = phoneMatch && phoneMatch[0] ? phoneMatch[0] : null;

  const websiteMatch = text.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  const website = websiteMatch ? websiteMatch[0] : null;

  const branchesMatch = text.match(/(\d+)\s*(филиал|точк)/i);
  const branches_value = branchesMatch ? Number(branchesMatch[1]) : null;

  const reputationPain = /плох|жалоб|недоволь|долг|срыв|качество/i.test(lower);
  const schedulingPain = /запис|очеред|ожидан/i.test(lower);

  return {
    name,
    rating,
    reviews_count,
    phone,
    website,
    branches_value,
    reputationPain,
    schedulingPain
  };
};

const buildProofItems = (page, sourceType, fields) => {
  const items = [];
  const push = (signal_type, signal_value, snippet) => {
    items.push({
      url: page.url,
      source_type: sourceType,
      signal_type,
      signal_value,
      evidence_snippet: sanitizeEvidenceSnippet(snippet || `${signal_type}: ${signal_value}`)
    });
  };

  push("card_presence", page.url, page.title || page.url);

  if (fields.rating !== null) {
    push("rating", fields.rating, `rating: ${fields.rating}`);
  }
  if (fields.reviews_count !== null) {
    push("reviews_count", fields.reviews_count, `reviews: ${fields.reviews_count}`);
  }
  if (fields.phone) {
    push("phone", fields.phone, `phone: ${fields.phone}`);
  }
  if (fields.website) {
    push("website", fields.website, `website: ${fields.website}`);
  }
  if (fields.branches_value !== null) {
    push("branches", fields.branches_value, `branches: ${fields.branches_value}`);
  }
  if (fields.reputationPain) {
    push("reputation_pain", "reputation", "reputation_pain: негативные упоминания");
  }
  if (fields.schedulingPain) {
    push("scheduling_pain", "scheduling", "scheduling_pain: запись/очереди");
  }

  return items.slice(0, 4);
};

const buildAppointmentFrictionSignals = (text = "", sourceType = "website") => {
  const lower = String(text).toLowerCase();
  const signals = [];
  if (/запис|book|appointment/.test(lower)) {
    signals.push({
      signal: "Есть упоминания записи/appointment.",
      source_type: sourceType
    });
  }
  if (/расписан|график|schedule/.test(lower)) {
    signals.push({
      signal: "Есть упоминания расписания/графика.",
      source_type: sourceType
    });
  }
  if (/оператор|администратор|дозвон/.test(lower)) {
    signals.push({
      signal: "Есть признаки операторской нагрузки/дозвона.",
      source_type: sourceType
    });
  }
  if (/отзыв|reviews?/.test(lower)) {
    signals.push({
      signal: "Есть сигналы по отзывам/репутации.",
      source_type: sourceType
    });
  }
  return signals.slice(0, 4);
};

const countPainOrGrowthSignals = (lead) => {
  let count = 0;
  if (Array.isArray(lead.appointment_friction_signals) && lead.appointment_friction_signals.length) {
    count += Math.min(2, lead.appointment_friction_signals.length);
  }
  if (lead.reviews_count && lead.reviews_count >= 80) count += 1;
  if (lead.branch_count_estimate && lead.branch_count_estimate.value >= 2) count += 1;
  if (lead.rating && lead.rating >= 4.3) count += 1;
  return count;
};

const computeContactabilityScore = (lead) => {
  let score = 0;
  if (lead.phone) score += 1;
  if (lead.website) score += 1;
  if (lead.enrichment_minimal?.email) score += 1;
  if (
    Array.isArray(lead.enrichment_minimal?.messengers) &&
    lead.enrichment_minimal.messengers.length > 0
  ) {
    score += 1;
  }
  return score;
};

const enrichLeadMinimal = async (webClient, website) => {
  if (!website || !webClient) {
    return { checked: false, website: website || null, email: null, messengers: [], proof_item: null };
  }
  const target = canonicalizeUrl(website);
  const page = await webClient.fetchPage(target, { type: "enrichment_minimal" });
  if ("blocked" in page) {
    return {
      checked: true,
      website: target,
      email: null,
      messengers: [],
      proof_item: {
        url: target,
        source_type: "website",
        signal_type: "enrichment_blocked",
        signal_value: "blocked",
        evidence_snippet: sanitizeEvidenceSnippet("enrichment minimal blocked")
      }
    };
  }
  const text = page.text || "";
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const tgMatch = /(t\.me\/[a-z0-9_]+)/i.exec(text);
  const waMatch = /(wa\.me\/\d+|whatsapp)/i.exec(text);
  const vkMatch = /(vk\.com\/[a-z0-9_.-]+)/i.exec(text);
  const messengers = [];
  if (tgMatch) messengers.push("telegram");
  if (waMatch) messengers.push("whatsapp");
  if (vkMatch) messengers.push("vk");
  const email = emailMatch && emailMatch[0] ? normalizeEmail(emailMatch[0]) : "";

  return {
    checked: true,
    website: target,
    email: email || null,
    messengers,
    proof_item: {
      url: page.url,
      source_type: "website",
      signal_type: "enrichment_minimal",
      signal_value: email || messengers.join(",") || "no_contacts_found",
      evidence_snippet: sanitizeEvidenceSnippet(
        email
          ? `email: ${email}`
          : messengers.length
            ? `messengers: ${messengers.join(", ")}`
            : "contacts not found on homepage"
      )
    }
  };
};

const computeDedupeKey = (lead, input) => {
  const domain = lead.website ? extractDomainFromUrl(lead.website) : "";
  const phone = lead.phone ? normalizePhone(lead.phone) : "";
  const name = lead.name || "";
  const city = lead.city || "";

  if (input.dedupe_by === "domain" && domain) {
    return makeDedupeKey({ domain }, { prefix: false });
  }
  if (input.dedupe_by === "phone" && phone) {
    return makeDedupeKey({ phone }, { prefix: false });
  }
  if (input.dedupe_by === "name_city") {
    return makeDedupeKey({ name, city }, { prefix: false });
  }
  if (input.dedupe_by === "mixed") {
    if (domain) return makeDedupeKey({ domain }, { prefix: false });
    if (phone) return makeDedupeKey({ phone }, { prefix: false });
    return makeDedupeKey({ name, city }, { prefix: false });
  }
  return makeDedupeKey({ name, city }, { prefix: false });
};

const scoreLead = (lead, input) => {
  let score = 30;
  if (lead.branch_count_estimate.value && lead.branch_count_estimate.value >= input.min_branches) {
    score += 20;
  }
  if (lead.reviews_count && lead.reviews_count >= input.min_reviews) score += 15;
  if (lead.rating && lead.rating >= input.min_rating) score += 10;
  if (input.signals.ads_or_visibility && lead.reviews_count && lead.reviews_count >= 100) score += 10;
  if (input.signals.reputation_pain && lead.notes.includes("репутация")) score += 10;
  if (input.signals.scheduling_pain && lead.notes.includes("записи")) score += 5;
  if (lead.contactability_score >= 1) score += 10;
  if (lead.pain_or_growth_signals_count >= 2) score += 10;
  return Math.min(100, score);
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const webClient = options.webClient;
  const lastData = unwrapLegacy(options.last_run);

  if (!input.query || !input.geo) {
    const legacyOutput = {
      leads: [],
      meta: {
        generated_at: new Date().toISOString(),
        search_plan: { queries_used: [] },
        web_stats: {
          requests_made: 0,
          blocked_count: 0,
          errors_count: 0,
          duration_ms: 0,
          sources_used: {},
          domains_blocked: [],
          sources_breakdown: {},
          top_errors: [],
          warnings: [],
          trace_summary: {}
        },
        proof_items: [],
        limitations: ["Уточните: какая категория бизнеса и какой город?"],
        assumptions: [],
        quality_checks: { no_gray_scraping: true, no_fabrication: true, dedupe_ok: true }
      }
    };
    applyBudgetMeta(legacyOutput.meta, input);
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  if (!input.has_web_access || !webClient) {
    const legacyOutput = {
      leads: [],
      meta: {
        generated_at: new Date().toISOString(),
        search_plan: { queries_used: [] },
        web_stats: {
          requests_made: 0,
          blocked_count: 0,
          errors_count: 0,
          duration_ms: 0,
          sources_used: {},
          domains_blocked: [],
          sources_breakdown: {},
          top_errors: [],
          warnings: [],
          trace_summary: {}
        },
        proof_items: [],
        limitations: ["Нет веб-доступа для проверки источников."],
        assumptions: [],
        quality_checks: { no_gray_scraping: true, no_fabrication: true, dedupe_ok: true }
      }
    };
    applyBudgetMeta(legacyOutput.meta, input);
    return { output: wrapOutput(legacyOutput, input), effectiveInput: input };
  }

  const previousQueries =
    input.mode === "continue" &&
    lastData &&
    lastData.meta &&
    lastData.meta.search_plan &&
    Array.isArray(lastData.meta.search_plan.queries_used)
      ? lastData.meta.search_plan.queries_used
      : null;
  const searchQueries = previousQueries && previousQueries.length ? previousQueries : buildSearchPlan(input);
  const search_plan = { queries_used: searchQueries };
  const seedUrls = Array.isArray(lastData?.meta?.seed_urls) && input.mode === "continue"
    ? [...lastData.meta.seed_urls]
    : [];
  const excludeDomains = new Set(input.exclude_domains.map((item) => item.toLowerCase()));

  if (seedUrls.length === 0) {
    for (const query of searchQueries) {
      const results = await webClient.search(query, "yandex", input.mode === "quick" ? 3 : 5);
      results.forEach((item) => {
        if (!item.url) return;
        if (isLikelyBadSeed(item.url)) return;
        const canonical = canonicalizeUrl(item.url);
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

  const previousLeads = Array.isArray(lastData?.leads) ? lastData.leads : [];
  const previousKeys = new Set(
    previousLeads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
  );
  const remainingTarget =
    input.mode === "continue" && previousLeads.length > 0
      ? Math.max(1, input.target_count - previousLeads.length)
      : input.target_count;
  const maxCards = input.mode === "quick" ? Math.ceil(remainingTarget / 2) : remainingTarget;
  const leads = [];
  const proof_items = [];
  const limitations = [];
  const dedupeKeys = new Set();
  const domainsBlocked = new Set();
  const sourcesBreakdown = {
    cards_scanned: 0,
    cards_kept: 0,
    enrichment_checks: 0,
    by_source: {}
  };
  let gateRejected = 0;

  for (const url of seedUrls.slice(0, maxCards)) {
    sourcesBreakdown.cards_scanned += 1;
    const page = await webClient.fetchPage(url, { type: "card" });
    if ("blocked" in page) {
      limitations.push(`Недоступна карточка: ${url}`);
      try {
        domainsBlocked.add(new URL(url).hostname.replace(/^www\./, "").toLowerCase());
      } catch {}
      continue;
    }
    if (!page.text || page.text.trim().length < 10) {
      limitations.push(`Похоже на JS-рендер: ${url}`);
      continue;
    }

    const sourceType = sourceTypeForUrl(url, input);
    const genericExtract = extractFromHtml(page.html || "", page.url);
    const fields = { ...genericExtract.fields, ...extractLeadFields(page, input) };

    if (input.exclude_names.some((item) => fields.name.toLowerCase().includes(item.toLowerCase()))) {
      continue;
    }

    const lead = {
      name: fields.name,
      city: input.geo,
      category: input.query,
      source: sourceType,
      card_url: page.url,
      website: fields.website || null,
      phone: fields.phone || null,
      branch_count_estimate: {
        value: fields.branches_value || undefined,
        unknown: fields.branches_value === null,
        estimate: fields.branches_value !== null
      },
      rating: fields.rating || undefined,
      reviews_count: fields.reviews_count || undefined,
      appointment_friction_signals: [],
      enrichment_minimal: {
        checked: false,
        website: fields.website || null,
        email: null,
        messengers: [],
        proof_refs: []
      },
      contactability_score: 0,
      pain_or_growth_signals_count: 0,
      score: 0,
      why_fit: "",
      notes: "",
      dedupe_key: "",
      proof_refs: []
    };

    const notes = [];
    if (fields.reputationPain) notes.push("болит репутация");
    if (fields.schedulingPain) notes.push("болит запись/расписание");
    lead.notes = notes.join("; ");

    const proofs = [
      ...(Array.isArray(genericExtract.proof_items) ? genericExtract.proof_items : []),
      ...buildProofItems(page, sourceType, fields)
    ];
    proofs.forEach((proof) => {
      const index = proof_items.length;
      proof_items.push(proof);
      lead.proof_refs.push(index);
    });

    const frictionSignals = buildAppointmentFrictionSignals(page.text, sourceType);
    frictionSignals.forEach((item) => {
      const index = proof_items.length;
      proof_items.push({
        url: page.url,
        source_type: item.source_type,
        signal_type: "appointment_friction",
        signal_value: item.signal,
        evidence_snippet: sanitizeEvidenceSnippet(item.signal)
      });
      lead.proof_refs.push(index);
      lead.appointment_friction_signals.push({
        signal: item.signal,
        proof_refs: [index]
      });
    });

    if (input.require_proof && lead.proof_refs.length === 0) {
      limitations.push(`Недостаточно доказательств: ${page.url}`);
      if (!input.allow_placeholders_if_blocked) {
        continue;
      }
    }

    if (input.enrichment_minimal && lead.website) {
      sourcesBreakdown.enrichment_checks += 1;
      const enrichment = await enrichLeadMinimal(webClient, lead.website);
      const enrichmentRefs = [];
      if (enrichment.proof_item) {
        const index = proof_items.length;
        proof_items.push(enrichment.proof_item);
        lead.proof_refs.push(index);
        enrichmentRefs.push(index);
      }
      lead.enrichment_minimal = {
        checked: enrichment.checked,
        website: enrichment.website,
        email: enrichment.email,
        messengers: enrichment.messengers,
        proof_refs: enrichmentRefs
      };
      if (!lead.email && enrichment.email) {
        lead.email = enrichment.email;
      }
    }

    lead.contactability_score = computeContactabilityScore(lead);
    lead.pain_or_growth_signals_count = countPainOrGrowthSignals(lead);

    const gate = input.lead_quality_gate;
    if (
      lead.contactability_score < gate.min_contactability ||
      lead.pain_or_growth_signals_count < gate.min_pain_or_growth_signals
    ) {
      gateRejected += 1;
      limitations.push(
        `lead_quality_gate: отклонён ${lead.name || page.url} (contactability=${lead.contactability_score}, signals=${lead.pain_or_growth_signals_count})`
      );
      continue;
    }

    lead.dedupe_key = computeDedupeKey(lead, input);
    if (previousKeys.has(lead.dedupe_key)) {
      continue;
    }
    if (dedupeKeys.has(lead.dedupe_key)) {
      continue;
    }
    dedupeKeys.add(lead.dedupe_key);

    lead.score = scoreLead(lead, input);
    lead.why_fit = lead.notes
      ? `Сигналы: ${lead.notes}.`
      : "Сигналы требуют проверки.";
    sourcesBreakdown.cards_kept += 1;
    sourcesBreakdown.by_source[sourceType] = (sourcesBreakdown.by_source[sourceType] ?? 0) + 1;

    leads.push(lead);
  }

  const stats = webClient.getStats();
  const trace = webClient.getTrace();
  const traceSummary = trace.reduce((acc, item) => {
    const key = `${item.domain}:${item.type}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    leads,
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
          yandex: trace.filter((item) => item.domain.includes("yandex")).length,
          gis: trace.filter((item) => item.domain.includes("2gis")).length,
          avito: trace.filter((item) => item.domain.includes("avito")).length,
          websites: trace.filter(
            (item) =>
              !item.domain.includes("yandex") &&
              !item.domain.includes("2gis") &&
              !item.domain.includes("avito")
          ).length
        },
        domains_blocked: [...domainsBlocked],
        sources_breakdown: sourcesBreakdown,
        top_errors: stats.top_errors || [],
        warnings: stats.warnings || [],
        trace_summary: traceSummary
      },
      proof_items,
      limitations,
      assumptions: [],
      quality_checks: {
        no_gray_scraping: true,
        no_fabrication: proof_items.length > 0,
        dedupe_ok: dedupeKeys.size === leads.length,
        lead_quality_gate_rejected: gateRejected
      }
    }
  };
  applyBudgetMeta(output.meta, input);

  const envelope = wrapOutput(output, input);
  if (input.mode === "refresh" && options.last_run) {
    const prev = unwrapLegacy(options.last_run);
    const prevLeads = Array.isArray(prev.leads) ? prev.leads : [];
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

const generateMaximOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateMaximOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.leads)) {
    errors.push("leads must be an array.");
  }
  if (!payload.meta || typeof payload.meta !== "object") {
    errors.push("meta must be an object.");
  }
  if (Array.isArray(payload.leads)) {
    payload.leads.forEach((lead, index) => {
      if (!lead.branch_count_estimate || typeof lead.branch_count_estimate !== "object") {
        errors.push(`leads[${index}].branch_count_estimate is required.`);
      }
      if (!Array.isArray(lead.appointment_friction_signals)) {
        errors.push(`leads[${index}].appointment_friction_signals must be array.`);
      }
      if (!lead.enrichment_minimal || typeof lead.enrichment_minimal !== "object") {
        errors.push(`leads[${index}].enrichment_minimal is required.`);
      }
      if (
        typeof lead.contactability_score !== "number" ||
        lead.contactability_score < 0
      ) {
        errors.push(`leads[${index}].contactability_score must be number >= 0.`);
      }
      if (
        typeof lead.pain_or_growth_signals_count !== "number" ||
        lead.pain_or_growth_signals_count < 0
      ) {
        errors.push(`leads[${index}].pain_or_growth_signals_count must be number >= 0.`);
      }
    });
  }
  if (payload.meta?.web_stats) {
    if (!Array.isArray(payload.meta.web_stats.domains_blocked)) {
      errors.push("meta.web_stats.domains_blocked must be array.");
    }
    if (
      !payload.meta.web_stats.sources_breakdown ||
      typeof payload.meta.web_stats.sources_breakdown !== "object"
    ) {
      errors.push("meta.web_stats.sources_breakdown must be object.");
    }
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  DEFAULT_QUERY_CONTEXT,
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  maximAgent,
  normalizeInput,
  generateOutput,
  generateMaximOutput,
  validateMaximOutput
};
