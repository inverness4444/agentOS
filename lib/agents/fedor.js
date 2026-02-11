const { canonicalizeUrl } = require("./webClient.js");
const { wrapAgentOutput, unwrapLegacy } = require("../../utils/agentEnvelope.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");
const { applyBudget, applyBudgetMeta } = require("../../utils/budget.js");
const {
  normalizeEmail,
  normalizePhone,
  extractDomainFromUrl,
  makeDedupeKey
} = require("../../utils/normalize.js");
const { extractFromHtml } = require("../../extractors");

const inputDefaults = {
  mode: "deep",
  has_web_access: true,
  max_web_requests: null,
  industries: [],
  geo: "Россия",
  source: "multi",
  target_count: null,
  require_proof: true,
  allow_placeholders_if_blocked: true,
  exclude_domains: [],
  exclude_names: [],
  dedupe_by: "mixed",
  prefer_inn: true,
  recency_days: 365
};

const inputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { type: "string", enum: ["quick", "deep", "continue", "refresh"], default: "deep" },
    has_web_access: { type: "boolean", default: true },
    max_web_requests: { type: "number" },
    industries: { type: "array", items: { type: "string" } },
    geo: { type: "string", default: "Россия" },
    source: {
      type: "string",
      enum: ["catalogs", "associations", "exhibitions", "partners_pages", "multi"],
      default: "multi"
    },
    target_count: { type: "number" },
    require_proof: { type: "boolean", default: true },
    allow_placeholders_if_blocked: { type: "boolean", default: true },
    exclude_domains: { type: "array", items: { type: "string" } },
    exclude_names: { type: "array", items: { type: "string" } },
    dedupe_by: {
      type: "string",
      enum: ["domain", "phone", "inn", "mixed"],
      default: "mixed"
    },
    prefer_inn: { type: "boolean", default: true },
    recency_days: { type: "number", default: 365 }
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

const systemPrompt = `Ты — ИИ-агент agentOS: "Фёдор — B2B лиды".
Роль: собирать B2B лиды по публичным каталогам/реестрам/ассоциациям/выставкам/страницам партнеров.
Никаких обходов капчи/логинов/скрытых API. Только публичные данные.`;

const fedorAgent = {
  id: "fedor-b2b-leads-ru",
  displayName: "Фёдор — B2B лиды",
  description:
    "Собирает B2B лиды из публичных реестров/каталогов/партнерских страниц с доказательствами.",
  inputSchema,
  outputSchema,
  systemPrompt
};

const wrapOutput = (legacyOutput, input) =>
  wrapAgentOutput({
    agentId: fedorAgent.id,
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
  return mode === "quick" ? 30 : 80;
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
    industries: Array.isArray(safe.industries)
      ? safe.industries.filter((item) => typeof item === "string" && item.trim())
      : [],
    geo: typeof safe.geo === "string" && safe.geo.trim() ? safe.geo.trim() : "Россия",
    source: ["catalogs", "associations", "exhibitions", "partners_pages", "multi"].includes(safe.source)
      ? safe.source
      : "multi",
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
    dedupe_by: ["domain", "phone", "inn", "mixed"].includes(safe.dedupe_by)
      ? safe.dedupe_by
      : "mixed",
    prefer_inn: typeof safe.prefer_inn === "boolean" ? safe.prefer_inn : true,
    recency_days:
      typeof safe.recency_days === "number" && Number.isFinite(safe.recency_days)
        ? Math.max(1, Math.round(safe.recency_days))
        : 365
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
  const year = new Date().getFullYear();
  const include = (source) => input.source === "multi" || input.source === source;

  input.industries.forEach((industry) => {
    if (include("catalogs")) {
      queries.push(`каталог компаний ${industry}`);
      queries.push(`реестр ${industry} участники`);
      queries.push(`поставщики ${industry}`);
    }
    if (include("associations")) {
      queries.push(`ассоциация ${industry} участники`);
      queries.push(`реестр членов ассоциации ${industry}`);
    }
    if (include("exhibitions")) {
      queries.push(`выставка ${industry} участники список ${year}`);
      queries.push(`экспоненты ${industry} ${year}`);
    }
    if (include("partners_pages")) {
      queries.push(`партнеры ${industry} список партнеров`);
      queries.push(`интеграторы ${industry} партнеры`);
    }
  });

  return [...new Set(queries.filter(Boolean))];
};

const extractUrlsFromHtml = (html = "") => {
  const links = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html))) {
    if (match[1] && match[1].startsWith("http")) {
      links.push(match[1]);
    }
  }
  return [...new Set(links.map((url) => canonicalizeUrl(url)))];
};

const isLikelyBadSeed = (url) => {
  return /top-10|топ-10|рейтинги|лучшие|статья|blog|news/i.test(url);
};

const sourceTypeForUrl = (url, input) => {
  if (input.source === "associations") return "association";
  if (input.source === "exhibitions") return "exhibition";
  if (input.source === "partners_pages") return "partners_page";
  return "catalog";
};

const extractLeadFields = (page, industries) => {
  const title = page.title || "";
  const text = page.text || "";
  const lower = text.toLowerCase();

  const name = title.split("|")[0].split("—")[0].trim() || "";
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  const phoneMatch = text.match(/(\+7|8)\s?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g);
  const innMatch = text.match(/ИНН\s*(\d{10,12})/i);
  const ogrnMatch = text.match(/ОГРН\s*(\d{13})/i);
  const websiteMatch = text.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  const cityMatch = text.match(/г\.\s*([А-ЯA-Z][a-zа-я-]+)/i);
  const employeesMatch = text.match(/(\d{2,5})\s*(сотрудник|штат|чел)/i);
  const revenueMatch = text.match(/(выручка|оборот)\s*(до|около|примерно|более|от)?\s*(\d{1,4})\s*(млн|млрд|тыс)/i);
  const regionsMatch = text.match(/(\d{1,2})\s*(регион|город)/i);
  const branchesMatch = text.match(/(\d{1,4})\s*(филиал|точк|офис)/i);
  const facilitiesMatch = text.match(/(\d{1,3})\s*(склад|производственн|цех|парк)/i);

  const hiring = /ваканс|hh\.ru|ищем|открыта позиция/i.test(lower);
  const certificationsMatch = text.match(/iso\s*\d+|сертификат|лицензия|аттестат/gi) || [];
  const serviceKeywordMatch = text.match(/(услуг[аи]|сервис|решени[ея]|внедрени[ея]|поддержк[аи])\s*[:\-]\s*([^\n.]+)/i);
  const serviceKeywords = serviceKeywordMatch
    ? serviceKeywordMatch[2]
        .split(/[,;/]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const hasForm = /форма|оставьте заявку|submit|send/i.test(lower);
  const hasTg = /t\.me\/|telegram/i.test(lower);
  const hasVk = /vk\.com\//i.test(lower);

  const sizeSignals = {
    employees: {
      value: employeesMatch ? Number(employeesMatch[1]) : null,
      unknown: !employeesMatch
    },
    revenue: {
      value: revenueMatch ? revenueMatch[0] : null,
      unknown: !revenueMatch
    },
    regions: {
      value: regionsMatch ? [regionsMatch[0]] : [],
      unknown: !regionsMatch
    },
    branches: {
      value: branchesMatch ? Number(branchesMatch[1]) : null,
      unknown: !branchesMatch
    },
    facilities: {
      value: facilitiesMatch ? [facilitiesMatch[0]] : [],
      unknown: !facilitiesMatch
    },
    hiring: {
      value: hiring,
      unknown: false
    },
    certifications: {
      value: Array.from(new Set(certificationsMatch.map((item) => item.trim()).filter(Boolean))),
      unknown: certificationsMatch.length === 0
    }
  };

  const industryTags = industries.filter((industry) => lower.includes(industry.toLowerCase()));
  const industryFitTags = Array.from(
    new Set(
      [
        ...industryTags,
        /логист/i.test(lower) ? "логистика" : "",
        /автоматизац/i.test(lower) ? "автоматизация" : "",
        /интеграц/i.test(lower) ? "интеграции" : "",
        /опт|дистр/i.test(lower) ? "дистрибуция" : "",
        /производств/i.test(lower) ? "производство" : "",
        /b2b/i.test(lower) ? "b2b" : "",
        /сервис/i.test(lower) ? "сервис" : ""
      ].filter(Boolean)
    )
  ).slice(0, 7);

  return {
    name,
    email: emailMatch ? normalizeEmail(emailMatch[0]) : "",
    phone: phoneMatch ? normalizePhone(phoneMatch[0]) : "",
    inn: innMatch ? innMatch[1] : "",
    ogrn: ogrnMatch ? ogrnMatch[1] : "",
    website: websiteMatch ? canonicalizeUrl(websiteMatch[0]) : "",
    city: cityMatch ? cityMatch[1] : "",
    industryTags: industryTags.length ? industryTags : [...industries],
    industryFitTags: industryFitTags.length ? industryFitTags : [...industries].slice(0, 7),
    serviceKeywords,
    sizeSignals,
    hasForm,
    hasTg,
    hasVk
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

  push("page_presence", page.url, page.title || page.url);
  if (fields.email) push("email", fields.email, `email: ${fields.email}`);
  if (fields.phone) push("phone", fields.phone, `phone: ${fields.phone}`);
  if (fields.website) push("website", fields.website, `website: ${fields.website}`);
  if (fields.inn) push("inn", fields.inn, `ИНН: ${fields.inn}`);
  if (fields.ogrn) push("ogrn", fields.ogrn, `ОГРН: ${fields.ogrn}`);
  if (!fields.sizeSignals.employees.unknown) {
    push("size_employees", fields.sizeSignals.employees.value, `employees: ${fields.sizeSignals.employees.value}`);
  }
  if (!fields.sizeSignals.branches.unknown) {
    push("size_branches", fields.sizeSignals.branches.value, `branches: ${fields.sizeSignals.branches.value}`);
  }
  if (!fields.sizeSignals.revenue.unknown) {
    push("size_revenue", fields.sizeSignals.revenue.value, `revenue: ${fields.sizeSignals.revenue.value}`);
  }
  if (!fields.sizeSignals.hiring.unknown && fields.sizeSignals.hiring.value) {
    push("size_hiring", "hiring", "hiring: vacancies detected");
  }

  return items.slice(0, 6);
};

const computeDedupeDecision = (lead, input) => {
  const domain = lead.domain || (lead.website ? extractDomainFromUrl(lead.website) : "");
  const phone = lead.phone ? normalizePhone(lead.phone) : "";
  const base = {
    inn: lead.inn,
    domain,
    phone,
    name: lead.name,
    city: lead.city || lead.region || ""
  };

  if (input.prefer_inn && lead.inn) {
    return { key: makeDedupeKey({ inn: lead.inn }, { prefix: true }), rule: "inn" };
  }
  if (input.dedupe_by === "inn" && lead.inn) {
    return { key: makeDedupeKey({ inn: lead.inn }, { prefix: true }), rule: "inn" };
  }
  if (input.dedupe_by === "domain" && domain) {
    return { key: makeDedupeKey({ domain }, { prefix: true }), rule: "domain" };
  }
  if (input.dedupe_by === "phone" && phone) {
    return { key: makeDedupeKey({ phone }, { prefix: true }), rule: "phone" };
  }
  if (input.dedupe_by === "mixed") {
    if (lead.inn) return { key: makeDedupeKey({ inn: lead.inn }, { prefix: true }), rule: "inn" };
    if (domain) return { key: makeDedupeKey({ domain }, { prefix: true }), rule: "domain" };
    if (phone) return { key: makeDedupeKey({ phone }, { prefix: true }), rule: "phone" };
    return { key: makeDedupeKey(base, { prefix: true }), rule: "name_city" };
  }
  return {
    key: makeDedupeKey({ name: lead.name, city: lead.city || lead.region || "" }, { prefix: true }),
    rule: "name_city"
  };
};

const scoreLead = (lead) => {
  let score = 30;
  if (lead.phone) score += 10;
  if (lead.email) score += 10;
  if (lead.website) score += 10;
  if (!lead.size_signals.branches.unknown || !lead.size_signals.employees.unknown) score += 15;
  if (Array.isArray(lead.industry_fit_tags) && lead.industry_fit_tags.length) score += 10;
  if (lead.contact_priority === "email") score += 5;
  return Math.min(100, score);
};

const resolveContactPriority = (lead) => {
  if (lead.email) return "email";
  if (lead.has_form) return "form";
  if (lead.phone) return "phone";
  if (lead.has_tg) return "tg";
  if (lead.has_vk) return "vk";
  return "unknown";
};

const applyLastRun = (input, lastRun) => {
  if (!lastRun || typeof lastRun !== "object") return input;
  const prevData = unwrapLegacy(lastRun);
  const prev = Array.isArray(prevData.leads) ? prevData.leads : [];
  const prevKeys = prev
    .map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : ""))
    .filter(Boolean);
  if (prevKeys.length === 0) return input;
  return {
    ...input,
    exclude_names: [...input.exclude_names, ...prevKeys]
  };
};

const generateOutput = async (rawInput = {}, options = {}) => {
  const input = normalizeInput(rawInput);
  const webClient = options.webClient;
  const lastData = unwrapLegacy(options.last_run);

  if (!input.industries || input.industries.length === 0) {
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
          top_errors: [],
          warnings: [],
          trace_summary: {}
        },
        proof_items: [],
        limitations: ["Какие 1–3 отрасли и какой регион?"],
        assumptions: [],
        dedupe_report: {
          scanned_total: 0,
          kept_total: 0,
          removed_total: 0,
          removed_by_inn: 0,
          removed_by_domain: 0,
          removed_by_phone: 0,
          removed_by_name_city: 0
        },
        quality_checks: {
          no_gray_scraping: true,
          no_fabrication: true,
          dedupe_ok: true,
          prefer_inn_used: false
        }
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
          top_errors: [],
          warnings: [],
          trace_summary: {}
        },
        proof_items: [],
        limitations: ["Нет веб-доступа для проверки источников."],
        assumptions: [],
        dedupe_report: {
          scanned_total: 0,
          kept_total: 0,
          removed_total: 0,
          removed_by_inn: 0,
          removed_by_domain: 0,
          removed_by_phone: 0,
          removed_by_name_city: 0
        },
        quality_checks: {
          no_gray_scraping: true,
          no_fabrication: true,
          dedupe_ok: true,
          prefer_inn_used: false
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

  if (seedUrls.length === 0) {
    for (const query of searchQueries) {
      const results = await webClient.search(query, "yandex", input.mode === "quick" ? 3 : 6);
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

  const leads = [];
  const proof_items = [];
  const limitations = [];
  const dedupeKeys = new Set();
  const dedupeReport = {
    scanned_total: 0,
    kept_total: 0,
    removed_total: 0,
    removed_by_inn: 0,
    removed_by_domain: 0,
    removed_by_phone: 0,
    removed_by_name_city: 0
  };
  let preferInnUsed = false;

  const previousLeads = Array.isArray(lastData?.leads) ? lastData.leads : [];
  const previousKeys = new Set(
    previousLeads.map((lead) => (lead && lead.dedupe_key ? lead.dedupe_key : "")).filter(Boolean)
  );
  const maxListPages = input.mode === "quick" ? 6 : 12;
  const maxLeads =
    input.mode === "continue" && previousLeads.length > 0
      ? Math.max(1, input.target_count - previousLeads.length)
      : input.target_count;

  for (const listUrl of seedUrls.slice(0, maxListPages)) {
    if (leads.length >= maxLeads) break;
    const listPage = await webClient.fetchPage(listUrl, { type: "list" });
    if ("blocked" in listPage) {
      limitations.push(`Недоступен список: ${listUrl}`);
      continue;
    }
    if (!listPage.text || listPage.text.trim().length < 10) {
      limitations.push(`JS-only список: ${listUrl}`);
      continue;
    }

    const sourceType = sourceTypeForUrl(listUrl, input);
    const companyLinks = extractUrlsFromHtml(listPage.html).slice(0, 20);
    const targets = companyLinks.length ? companyLinks : [listUrl];

    for (const companyUrl of targets.slice(0, 2)) {
      if (leads.length >= maxLeads) break;
      const page = await webClient.fetchPage(companyUrl, { type: "company" });
      if ("blocked" in page) {
        limitations.push(`Недоступна карточка: ${companyUrl}`);
        continue;
      }
      if (!page.text || page.text.trim().length < 10) {
        limitations.push(`JS-only карточка: ${companyUrl}`);
        continue;
      }

      dedupeReport.scanned_total += 1;
      const genericExtract = extractFromHtml(page.html || "", page.url);
      const fields = { ...genericExtract.fields, ...extractLeadFields(page, input.industries) };
      if (!fields.name) continue;
      if (input.exclude_names.some((item) => fields.name.toLowerCase().includes(item.toLowerCase()))) {
        continue;
      }

      const domain = fields.website ? extractDomainFromUrl(fields.website) : "";

      const lead = {
        name: fields.name,
        website: fields.website || null,
        domain: domain || null,
        phone: fields.phone || null,
        email: fields.email || null,
        city: fields.city || null,
        region: input.geo || null,
        industry_tags: fields.industryTags,
        industry_fit_tags: fields.industryFitTags.slice(0, 7),
        service_keywords: fields.serviceKeywords.slice(0, 8),
        source: sourceType,
        source_url: listUrl,
        inn: fields.inn || null,
        ogrn: fields.ogrn || null,
        size_signals: fields.sizeSignals,
        has_form: Boolean(fields.hasForm),
        has_tg: Boolean(fields.hasTg),
        has_vk: Boolean(fields.hasVk),
        contact_priority: "unknown",
        score: 0,
        why_fit: "",
        notes: "",
        dedupe_key: "",
        dedupe_explain: "",
        proof_refs: []
      };

      const proofs = [
        ...(Array.isArray(genericExtract.proof_items) ? genericExtract.proof_items : []),
        ...buildProofItems(page, sourceType, fields)
      ];
      proofs.forEach((proof) => {
        const index = proof_items.length;
        proof_items.push(proof);
        lead.proof_refs.push(index);
      });

      if (input.require_proof && lead.proof_refs.length === 0) {
        limitations.push(`Нет доказательств: ${companyUrl}`);
        if (!input.allow_placeholders_if_blocked) continue;
      }

      lead.contact_priority = resolveContactPriority(lead);
      const dedupeDecision = computeDedupeDecision(lead, input);
      lead.dedupe_key = dedupeDecision.key;
      lead.dedupe_explain = `kept_by_${dedupeDecision.rule}`;
      if (lead.dedupe_key.startsWith("inn:")) preferInnUsed = true;

      if (previousKeys.has(lead.dedupe_key) || dedupeKeys.has(lead.dedupe_key)) {
        dedupeReport.removed_total += 1;
        const key = `removed_by_${dedupeDecision.rule}`;
        if (Object.prototype.hasOwnProperty.call(dedupeReport, key)) {
          dedupeReport[key] += 1;
        }
        continue;
      }
      dedupeKeys.add(lead.dedupe_key);
      dedupeReport.kept_total += 1;

      lead.score = scoreLead(lead);
      const sizeNotes = [];
      if (!lead.size_signals.branches.unknown) sizeNotes.push(`филиалы: ${lead.size_signals.branches.value}`);
      if (!lead.size_signals.employees.unknown) sizeNotes.push(`сотрудники: ${lead.size_signals.employees.value}`);
      if (!lead.size_signals.hiring.unknown && lead.size_signals.hiring.value) sizeNotes.push("есть найм");
      lead.why_fit = sizeNotes.length
        ? `Публичные признаки: ${sizeNotes.join(", ")}.`
        : "Публичные признаки ограничены.";
      lead.notes = lead.industry_fit_tags.join(", ");

      leads.push(lead);
    }
  }

  const stats = webClient.getStats();
  const trace = webClient.getTrace();
  const traceSummary = trace.reduce((acc, item) => {
    const key = `${item.domain}:${item.type}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    leads: leads.sort((a, b) => b.score - a.score),
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
          catalogs: trace.filter((item) => item.type === "list").length,
          websites: trace.filter((item) => item.type === "company").length
        },
        top_errors: stats.top_errors || [],
        warnings: stats.warnings || [],
        trace_summary: traceSummary
      },
      proof_items,
      limitations,
      assumptions: [],
      dedupe_report: dedupeReport,
      quality_checks: {
        no_gray_scraping: true,
        no_fabrication: proof_items.length > 0,
        dedupe_ok: dedupeKeys.size === leads.length,
        prefer_inn_used: preferInnUsed
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

const generateFedorOutput = async (input = {}, options = {}) => {
  const result = await generateOutput(input, options);
  return result.output;
};

const validateFedorOutput = (payload) => {
  const errors = [];
  const legacy = unwrapLegacy(payload);
  if (!legacy || typeof legacy !== "object") {
    return { valid: false, errors: ["Output must be an object."] };
  }
  payload = legacy;
  if (!Array.isArray(payload.leads)) errors.push("leads must be array");
  if (!payload.meta) errors.push("meta required");
  if (Array.isArray(payload.leads)) {
    payload.leads.forEach((lead, index) => {
      const size = lead.size_signals;
      if (!size || typeof size !== "object") {
        errors.push(`leads[${index}].size_signals required`);
      } else {
        [
          "employees",
          "revenue",
          "regions",
          "branches",
          "facilities",
          "hiring",
          "certifications"
        ].forEach((field) => {
          if (!size[field] || typeof size[field] !== "object") {
            errors.push(`leads[${index}].size_signals.${field} required`);
          } else if (typeof size[field].unknown !== "boolean") {
            errors.push(`leads[${index}].size_signals.${field}.unknown must be boolean`);
          }
        });
      }
      if (!Array.isArray(lead.industry_fit_tags) || lead.industry_fit_tags.length < 1) {
        errors.push(`leads[${index}].industry_fit_tags required`);
      }
      if (!Array.isArray(lead.service_keywords)) {
        errors.push(`leads[${index}].service_keywords must be array`);
      }
      if (!lead.dedupe_explain || typeof lead.dedupe_explain !== "string") {
        errors.push(`leads[${index}].dedupe_explain required`);
      }
      if (!["email", "form", "phone", "tg", "vk", "unknown"].includes(lead.contact_priority)) {
        errors.push(`leads[${index}].contact_priority invalid`);
      }
    });
  }
  if (!payload.meta?.dedupe_report || typeof payload.meta.dedupe_report !== "object") {
    errors.push("meta.dedupe_report required");
  }
  return { valid: errors.length === 0, errors };
};

module.exports = {
  inputDefaults,
  inputSchema,
  outputSchema,
  systemPrompt,
  fedorAgent,
  normalizeInput,
  generateOutput,
  generateFedorOutput,
  validateFedorOutput
};
