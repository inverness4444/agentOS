const test = require("node:test");
const assert = require("node:assert/strict");
const { generateArtemOutput } = require("../lib/agents/artem");
const { unwrapData } = require("./helpers");

const parseUserTextFromPrompt = (prompt) => {
  const text = String(prompt || "");
  const match = text.match(/user_text:\s*(.+)/i);
  return match ? match[1].trim() : "";
};

const extractKeywords = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._ -]+/gu, " ")
    .split(/\s+/)
    .filter((item) => item.length >= 4 && item.length <= 40)
    .slice(0, 16);

const createMockLLMProvider = () => ({
  name: "mock-llm",
  async generateJsonWithUsage({ meta, prompt } = {}) {
    if (meta?.step === "PARSE_INTENT") {
      const userText = parseUserTextFromPrompt(prompt);
      const keywords = extractKeywords(userText);
      const domains = keywords.filter((item) => item.includes("."));
      return {
        data: {
          offer: {
            product_or_service: keywords[0] || "автоматизация заявок",
            keywords: keywords.slice(0, 10),
            synonyms: keywords.slice(0, 6)
          },
          icp: {
            geo: keywords.filter((item) => /(россия|москва|снг)/i.test(item)).slice(0, 3),
            company_size: "20-500 сотрудников",
            industries: ["ритейл", "услуги", "b2b"],
            roles: ["владелец", "операционный директор", "маркетинг"]
          },
          constraints: {
            language: "ru",
            must_have: keywords.filter((item) => /(b2b|b2c|d2c|сотрудник)/i.test(item)).slice(0, 6),
            must_not_have: ["dictionary", "zhihu"]
          },
          buying_signal_lexicon: {
            ru: ["ищем", "нужно", "выбираем", "тендер", "закупка", "вакансия", "срочно"],
            en: ["looking for", "need", "tender", "rfp"]
          },
          negative_lexicon: {
            ru: ["что такое", "словарь", "форум", "anydesk"],
            en: ["dictionary", "forum", "quora", "zhihu", "reddit"]
          },
          product_or_service: keywords.slice(0, 6),
          target_customer: keywords.filter((item) => /(компан|бизнес|салон|селлер)/i.test(item)).slice(0, 5),
          keywords,
          synonyms_ru_en: keywords.slice(0, 6),
          negative_keywords: ["anydesk", "remote desktop", "reddit", "zhihu", "quora"],
          competitive_terms: [],
          domains
        },
        usage: { prompt_tokens: 140, completion_tokens: 90, total_tokens: 230 }
      };
    }

    if (meta?.step === "RELEVANCE_AND_LEAD_SCORING") {
      const ids = Array.isArray(meta?.candidate_ids) ? meta.candidate_ids : [];
      return {
        data: {
          items: ids.map((candidateId, index) => ({
            candidate_id: candidateId,
            source_type: index % 2 === 0 ? "social_post" : "company_page",
            entity_role: "buyer",
            relevance_score: index % 3 === 0 ? 90 : 82,
            intent_score: index % 3 === 0 ? 85 : 60,
            lead_type: index % 3 === 0 ? "Hot" : "Warm",
            has_buying_signal: index % 3 === 0,
            reason: "Совпадает с intent и содержит сигнал выбора решения.",
            evidence: "Ищем внедрение сервиса, есть запрос и контактный канал.",
            contact_hint: "Проверить страницу контактов/форму на источнике."
          }))
        },
        usage: { prompt_tokens: 160, completion_tokens: 120, total_tokens: 280 }
      };
    }

    return { data: {}, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
  },
  async generateJson(options = {}) {
    const result = await this.generateJsonWithUsage(options);
    return result.data;
  }
});

const createMockWebClient = () => {
  const trace = [];
  return {
    search: async (query, engine, limit) => {
      return [
        { url: "https://vk.com/wall-123_456" },
        { url: "https://t.me/somechannel/123" },
        { url: "https://yandex.ru/maps/org/review" }
      ]
        .slice(0, limit)
        .map((item) => ({
          ...item,
          title: "Result",
          snippet: query,
          query,
          engine,
          source_url: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
        }));
    },
    fetchPage: async (url) => {
      trace.push({ domain: new URL(url).hostname, type: url.includes("vk") ? "vk" : url.includes("t.me") ? "telegram" : "maps_yandex" });
      return {
        url,
        title: "Ищем подрядчика",
        html: "<html><title>Ищем подрядчика</title></html>",
        text:
          "Сегодня посоветуйте, кто сделает настройку Bitrix24. Срочно, сколько стоит и как быстро? Напишите в лс."
      };
    },
    getStats: () => ({
      requests_made: 6,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 50,
      top_errors: [],
      warnings: []
    }),
    getTrace: () => trace
  };
};

const createBlockedWebClient = () => ({
  search: async () => [{ url: "https://vk.com/blocked" }],
  fetchPage: async (url) => ({ blocked: true, url }),
  getStats: () => ({
    requests_made: 2,
    blocked_count: 2,
    errors_count: 0,
    duration_ms: 20,
    top_errors: [],
    warnings: []
  }),
  getTrace: () => []
});

const createSearchClientWithRealResults = () => {
  let callIndex = 0;
  return {
    search: async ({ query, limit }) => {
      callIndex += 1;
      const max = Math.max(1, Math.min(6, Number(limit || 6)));
      const buildItems = () =>
        Array.from({ length: max }, (_, index) => ({
          rank: index + 1,
          title: `Lead по запросу #${callIndex}-${index + 1}`,
          url: `https://example.com/leads/${callIndex}/${index + 1}`,
          source: "example.com",
          snippet: `Ищем подрядчика по теме "${query}", есть форма контакта и активный спрос.`
        }));

      return {
        ok: true,
        provider: "serpapi",
        query,
        fetched_at: new Date().toISOString(),
        duration_ms: 30,
        usage_tokens: 17,
        results: buildItems(),
        raw_json: { mock: true, query }
      };
    }
  };
};

const createEnrichedWebClient = () => {
  const trace = [];
  return {
    fetchPage: async (url) => {
      const sourceType = url.includes("vk.com")
        ? "vk"
        : url.includes("t.me")
          ? "telegram"
          : url.includes("yandex.ru/maps")
            ? "maps_yandex"
            : url.includes("2gis.ru")
              ? "maps_2gis"
              : "other";
      trace.push({ domain: new URL(url).hostname, type: sourceType });
      return {
        url,
        title: "Нужен подрядчик для обработки лидов",
        html: "<html><title>Нужен подрядчик</title></html>",
        text:
          "Ищем подрядчика на внедрение. Срочно, оставьте контакт и стоимость. Есть форма заявки и активная страница."
      };
    },
    getStats: () => ({
      requests_made: 24,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 180,
      top_errors: [],
      warnings: []
    }),
    getTrace: () => trace
  };
};

test("artem output basics and scoring", async () => {
  const envelope = await generateArtemOutput(
    {
      focus: "crm",
      mode: "quick",
      min_hot_score: 60,
      query_text: "Найди горячих лидов на внедрение CRM и автоматизацию заявок для малого бизнеса"
    },
    { webClient: createMockWebClient(), llmProvider: createMockLLMProvider() }
  );
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.hot_leads), "hot_leads array");
  assert.ok(output.hot_leads.length > 0, "has hot leads");
  assert.ok(Number(output.meta?.search_debug?.total_tokens || 0) > 0, "llm tokens tracked");
  assert.ok(
    Array.isArray(output.meta?.search_debug?.llm_calls) &&
      output.meta.search_debug.llm_calls.length >= 2,
    "llm calls tracked"
  );
  const lead = output.hot_leads[0];
  assert.ok(lead.hot_score >= 60, "hot_score respects min_hot_score");
  assert.ok(
    ["need_vendor", "need_advice", "complaint_trigger", "price_check", "other"].includes(
      lead.intent_class
    ),
    "intent_class set"
  );
  assert.ok(Array.isArray(lead.reply_angle_options) && lead.reply_angle_options.length === 3);
  assert.ok(typeof lead.qualification_question === "string" && lead.qualification_question.includes("(да/нет)"));
  assert.ok(lead.risk_flags && typeof lead.risk_flags.privacy_risk === "boolean");
  assert.ok(typeof lead.recency_hint === "string");
  if (lead.risk_flags.privacy_risk) {
    assert.equal(/видел ваш коммент/i.test(lead.suggested_first_contact), false);
  }

  output.meta.proof_items.forEach((item) => {
    assert.ok(item.evidence_snippet.length <= 160, "snippet <= 160");
    assert.equal(/<[^>]+>/.test(item.evidence_snippet), false, "no html");
  });

  const keys = new Set(output.hot_leads.map((item) => item.dedupe_key));
  assert.equal(keys.size, output.hot_leads.length, "dedupe_key unique");
  assert.equal(output.meta.quality_checks.no_gray_scraping, true, "no_gray_scraping true");
});

test("blocked sources add limitations", async () => {
  const envelope = await generateArtemOutput(
    { focus: "mixed" },
    { webClient: createBlockedWebClient(), llmProvider: createMockLLMProvider() }
  );
  const output = unwrapData(envelope);
  assert.ok(
    output && output.meta && Array.isArray(output.hot_leads),
    "blocked flow should return structured output"
  );
  assert.ok(
    Number.isFinite(Number(output.meta?.search_debug?.filtered_irrelevant_count || 0)),
    "blocked flow should keep diagnostics counters"
  );
});

test("scenario: quadrantstress query returns real leads with real urls", async () => {
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      focus: "mixed",
      geo: "Россия",
      min_hot_score: 60,
      keywords: ["quadrantstress.ru", "опросы по стрессу", "автоответы"],
      query_text:
        "Найди горячих лидов для сайта quadrantstress.ru, сервис опросов по стрессу для компаний от 20 до 1000 сотрудников"
    },
    {
      searchClient: createSearchClientWithRealResults(),
      webClient: createEnrichedWebClient(),
      llmProvider: createMockLLMProvider()
    }
  );
  const output = unwrapData(envelope);

  assert.equal(output.meta.status_code, "OK");
  assert.ok(Array.isArray(output.hot_leads));
  assert.ok(output.hot_leads.length >= 10, "expected at least 10 leads");
  assert.ok(Number(output.meta?.search_debug?.total_tokens || 0) > 0, "llm token usage present");
  assert.ok(Array.isArray(output.meta.search_debug?.searchQueries), "debug queries are present");
  assert.ok(output.meta.search_debug.searchQueries.length > 0, "queries list not empty");

  output.hot_leads.slice(0, 10).forEach((lead, index) => {
    assert.ok(/^https?:\/\//i.test(lead.url), `lead[${index}] has real URL`);
    assert.equal(/^search:\/\//i.test(lead.url), false, `lead[${index}] has no search:// url`);
    assert.ok(typeof lead.title === "string" && lead.title.trim().length > 0, "title present");
    assert.ok(
      typeof lead.request_summary === "string" && lead.request_summary.trim().length > 0,
      "snippet present"
    );
    assert.ok(typeof lead.why_match === "string" && lead.why_match.trim().length > 0, "why_match present");
    assert.ok(Number.isFinite(Number(lead.confidence)), "confidence present");
  });
});

test("search not available keeps honest status and still returns warm targets", async () => {
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      focus: "mixed",
      geo: "Россия",
      query_text: "Найди лидов для сервиса автоматизации заявок для малого бизнеса"
    },
    {
      searchClient: {
        search: async () => ({
          ok: false,
          provider: "search-api",
          status: 503,
          error: "SEARCH_NOT_AVAILABLE",
          message: "provider is not configured",
          results: []
        })
      },
      llmProvider: createMockLLMProvider()
    }
  );
  const output = unwrapData(envelope);

  assert.equal(output.meta.status_code, "SEARCH_NOT_AVAILABLE");
  assert.ok(Array.isArray(output.hot_leads) && output.hot_leads.length > 0, "warm targets fallback exists");
  assert.ok(
    output.hot_leads.every((lead) => String(lead.lead_type || "").toLowerCase() !== "hot"),
    "fallback should not fabricate hot leads"
  );
  assert.ok(Array.isArray(output.meta.search_debug?.searchQueries), "queries are returned");
  assert.ok(output.meta.search_debug.searchQueries.length > 0, "queries list is not empty");
});

test("query plan is generated strictly from user text without default hardcoded prompts", async () => {
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      query_text:
        "Найди лидов для сервиса автоматизации заявок для салонов красоты в Москве, компании 5-30 сотрудников"
    },
    {
      searchClient: {
        search: async ({ query }) => ({
          ok: true,
          provider: "mock-search",
          query,
          fetched_at: new Date().toISOString(),
          duration_ms: 1,
          usage_tokens: 0,
          results: []
        })
      },
      llmProvider: createMockLLMProvider()
    }
  );
  const output = unwrapData(envelope);
  const queries = Array.isArray(output.meta.search_debug?.searchQueries)
    ? output.meta.search_debug.searchQueries
    : [];

  assert.ok(queries.length >= 30 && queries.length <= 80, "query count in expected range");
  queries.forEach((query) => {
    const lower = String(query || "").toLowerCase();
    assert.equal(lower.includes("нужен подрядчик"), false, "no default подрядчик template");
    assert.equal(lower.includes("промт"), false, "no default prompt template");
  });
});

test("search execution respects max_web_requests budget", async () => {
  let calls = 0;
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      max_web_requests: 2,
      query_text: "Найди горячие лиды для CRM автоматизации в России"
    },
    {
      llmProvider: createMockLLMProvider(),
      searchClient: {
        search: async ({ query }) => {
          calls += 1;
          return {
            ok: true,
            provider: "mock-search",
            query,
            fetched_at: new Date().toISOString(),
            duration_ms: 1,
            usage_tokens: 0,
            results: []
          };
        }
      }
    }
  );
  const output = unwrapData(envelope);
  assert.ok(calls <= 2, "search calls must not exceed max_web_requests");
  assert.ok(output.meta?.search_plan?.query_limit_applied, "query limit marker is present");
  assert.equal(Number(output.meta?.search_plan?.queries_executed || 0), calls, "executed queries tracked");
});

test("source filters drop noisy domains and keep hot only for valid sources", async () => {
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      query_text: "Найди лидов на внедрение CRM для компаний в России"
    },
    {
      llmProvider: createMockLLMProvider(),
      searchClient: {
        search: async () => ({
          ok: true,
          provider: "mock-search",
          fetched_at: new Date().toISOString(),
          duration_ms: 1,
          usage_tokens: 0,
          results: [
            {
              rank: 1,
              title: "Zhihu question about CRM",
              url: "https://www.zhihu.com/question/123",
              source: "zhihu.com",
              snippet: "Question and answers about CRM."
            },
            {
              rank: 2,
              title: "Quora discussion",
              url: "https://www.quora.com/Some-CRM-topic",
              source: "quora.com",
              snippet: "General answers."
            },
            {
              rank: 3,
              title: "ООО Альфа — вакансия внедрение CRM",
              url: "https://hh.ru/vacancy/12345",
              source: "hh.ru",
              snippet: "Ищем внедрение CRM, нужен подрядчик и запуск в срок."
            },
            {
              rank: 4,
              title: "CRM блог",
              url: "https://example.com/blog/crm-overview",
              source: "example.com",
              snippet: "Обзор CRM решений."
            }
          ]
        })
      }
    }
  );
  const output = unwrapData(envelope);
  const urls = output.hot_leads.map((lead) => String(lead.url || "").toLowerCase());

  assert.equal(urls.some((url) => url.includes("zhihu.com")), false, "zhihu must be filtered");
  assert.equal(urls.some((url) => url.includes("quora.com")), false, "quora must be filtered");
  assert.ok(
    output.meta?.search_debug?.filtered_reasons?.["source_type_drop_forum/qna"] >= 2,
    "filtered reasons should include forum drops"
  );

  output.hot_leads.forEach((lead) => {
    const company = String(lead.company_or_organization || "");
    if (company.startsWith("source ")) {
      assert.notEqual(lead.lead_type, "Hot", "unknown company cannot be hot");
    }
  });
});

test("default geo_scope CIS filters out non-CIS domains", async () => {
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      workflow_mode: "hot_signals",
      query_text: "Найди горячие лиды для платформы опросов сотрудников"
    },
    {
      llmProvider: createMockLLMProvider(),
      searchClient: {
        search: async () => ({
          ok: true,
          provider: "mock-search",
          fetched_at: new Date().toISOString(),
          duration_ms: 1,
          usage_tokens: 0,
          results: [
            {
              rank: 1,
              title: "Deutsche Bank careers - platform vendor update",
              url: "https://deutsche-bank.de/platform",
              source: "deutsche-bank.de",
              snippet: "Platform pricing and integrations."
            },
            {
              rank: 2,
              title: "Тендер: внедрение платформы опросов сотрудников",
              url: "https://zakupki.gov.ru/epz/order/notice/1",
              source: "zakupki.gov.ru",
              snippet: "Ищем поставщика и собираем КП."
            }
          ]
        })
      }
    }
  );
  const output = unwrapData(envelope);
  const urls = output.hot_leads.map((lead) => String(lead.url || "").toLowerCase());

  assert.equal(urls.some((url) => url.includes("deutsche-bank.de")), false, "non-CIS domain must be dropped");
  assert.equal(output.meta.search_debug?.geo_scope, "cis");
  assert.ok(Number(output.meta.search_debug?.geo_drop_count || 0) > 0, "geo drops tracked");
  assert.ok(Array.isArray(output.meta.search_debug?.geo_drop_examples), "geo drop examples list exists");
});

test("no provider mode returns practical potential-clients plan without fake lead urls", async () => {
  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      workflow_mode: "auto",
      query_text: "Сервис автоматизации обработки заявок для B2B-компаний в России"
    },
    {
      llmProvider: createMockLLMProvider(),
      webSearchEnabled: false,
      searchProvider: "none"
    }
  );
  const output = unwrapData(envelope);

  assert.equal(output.meta.status_code, "NO_WEB_SEARCH_CONFIGURED");
  assert.ok(Array.isArray(output.hot_leads) && output.hot_leads.length === 0, "no hot table leads");
  assert.ok(Array.isArray(output.meta.top_best_segments), "top_best_segments present");
  assert.equal(output.meta.top_best_segments.length, 10, "top_best_segments has 10 rows");
  const topIndustryKeys = output.meta.top_best_segments.map((item) =>
    String(item?.industry_key || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
  assert.equal(new Set(topIndustryKeys).size, topIndustryKeys.length, "top segments are unique by industry");
  output.meta.top_best_segments.forEach((item, index) => {
    assert.ok(typeof item?.hrd_hook === "string" && item.hrd_hook.trim().length > 0, `hrd_hook[${index}]`);
    assert.ok(typeof item?.coo_hook === "string" && item.coo_hook.trim().length > 0, `coo_hook[${index}]`);
    assert.ok(typeof item?.icp_fit === "string" && item.icp_fit.trim().length > 0, `icp_fit[${index}]`);
  });
  const topSizeRanges = output.meta.top_best_segments.map((item) => String(item?.size_range || "").trim());
  assert.ok(new Set(topSizeRanges).size >= 4, "top segments have varied size ranges");

  assert.ok(Array.isArray(output.meta.where_to_get_company_lists), "where_to_get_company_lists present");
  assert.equal(output.meta.where_to_get_company_lists.length, 10, "sources for each top segment");
  output.meta.where_to_get_company_lists.forEach((item, index) => {
    const sources = Array.isArray(item?.sources) ? item.sources : [];
    assert.ok(sources.length >= 2 && sources.length <= 4, `sources[${index}] count in 2..4`);
    sources.forEach((source) => {
      assert.ok(
        typeof source?.quick_collect_3min === "string" && source.quick_collect_3min.trim().length > 0,
        "source quick 3min instruction exists"
      );
    });
  });
  assert.ok(
    Array.isArray(output.meta.universal_sources_for_all_segments) &&
      output.meta.universal_sources_for_all_segments.length >= 3,
    "universal sources block exists"
  );
  const cisSourceNames = [
    ...output.meta.universal_sources_for_all_segments.map((item) => String(item?.name || "")),
    ...output.meta.where_to_get_company_lists.flatMap((item) =>
      (Array.isArray(item?.sources) ? item.sources : []).map((source) => String(source?.name || ""))
    )
  ].join(" ").toLowerCase();
  assert.equal(/clutch|goodfirms/.test(cisSourceNames), false, "global catalogs excluded in CIS mode");
  const universalSourceKeys = output.meta.universal_sources_for_all_segments.map((item) =>
    String(item?.name || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
  assert.equal(
    new Set(universalSourceKeys).size,
    universalSourceKeys.length,
    "universal sources are deduplicated"
  );

  assert.ok(Array.isArray(output.meta.how_to_extract_list_fast), "how_to_extract_list_fast exists");
  assert.ok(
    output.meta.how_to_extract_list_fast.length >= 3 &&
      output.meta.how_to_extract_list_fast.length <= 5,
    "how_to_extract_list_fast has 3-5 steps"
  );

  assert.ok(output.meta.paste_list_to_rank && typeof output.meta.paste_list_to_rank === "object");
  assert.equal(output.meta.paste_list_to_rank.mode, "RANK_PROVIDED_LIST");
  assert.equal(output.meta.paste_list_to_rank.expected_items, "30-200");
  assert.ok(
    Array.isArray(output.meta.paste_list_to_rank.accepted_formats) &&
      output.meta.paste_list_to_rank.accepted_formats.includes("Company name only"),
    "fallback formats are exposed"
  );
  assert.equal(
    output.meta.paste_list_to_rank.recommended_format,
    "Company | domain(optional) | city(optional) | source(optional)",
    "recommended parser format is exposed"
  );
  assert.ok(
    Array.isArray(output.meta.paste_list_to_rank.domain_guidance) &&
      output.meta.paste_list_to_rank.domain_guidance.length >= 3,
    "domain guidance is exposed"
  );

  assert.ok(Array.isArray(output.meta.acquisition_playbook), "acquisition_playbook exists");
  assert.ok(
    output.meta.acquisition_playbook.length >= 3 && output.meta.acquisition_playbook.length <= 5,
    "acquisition playbook has 3-5 steps"
  );

  assert.ok(
    Array.isArray(output.meta.warm_targets) &&
      output.meta.warm_targets.length >= 25 &&
      output.meta.warm_targets.length <= 30
  );
  assert.equal(
    output.meta.warm_targets.some((item) => /SMB\s*сегмент/i.test(String(item?.company_type || ""))),
    false,
    "no placeholder SMB segment rows"
  );
  const typeKeys = output.meta.warm_targets.map((item) =>
    String(item?.company_type || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
  assert.equal(new Set(typeKeys).size, typeKeys.length, "warm targets are unique by company/type");

  const allowedLprRu = new Set([
    "HRD/Директор по персоналу",
    "Head of People/People Ops",
    "HRBP",
    "CEO/ГенДиректор",
    "COO/Операционный директор",
    "Руководитель службы охраны труда/ПБ (если релевантно)",
    "Руководитель корпоративных коммуникаций",
    "CFO (если закупка)"
  ]);
  output.meta.warm_targets.slice(0, 20).forEach((item, index) => {
    const roles = Array.isArray(item?.lpr_roles) ? item.lpr_roles : [];
    assert.ok(roles.length >= 2 && roles.length <= 4, `lpr_roles[${index}] has 2-4 roles`);
    assert.ok(typeof item?.icp_fit === "string" && item.icp_fit.trim().length > 0, `warm icp_fit[${index}]`);
    roles.forEach((role) => {
      assert.ok(allowedLprRu.has(String(role)), `unexpected role in warm target: ${role}`);
    });
  });

  assert.ok(output.meta.manual_hot_hunting && typeof output.meta.manual_hot_hunting === "object");
  assert.ok(output.meta.message_templates && typeof output.meta.message_templates === "object");
  assert.ok(Array.isArray(output.meta.message_templates.hrd) && output.meta.message_templates.hrd.length >= 4);
  assert.ok(Array.isArray(output.meta.message_templates.coo) && output.meta.message_templates.coo.length >= 4);
  assert.ok(
    Array.isArray(output.meta.manual_hot_hunting.short_queries) &&
      output.meta.manual_hot_hunting.short_queries.length >= 15 &&
      output.meta.manual_hot_hunting.short_queries.length <= 25,
    "manual short queries are present in expected count"
  );
  assert.equal(
    output.meta.manual_hot_hunting.short_queries.some((query) => String(query || "").length > 140),
    false,
    "manual queries are concise"
  );
  assert.ok(
    Array.isArray(output.meta.manual_hot_hunting.negative_examples) &&
      output.meta.manual_hot_hunting.negative_examples.length >= 5,
    "negative examples are present"
  );

  assert.equal(output.meta.search_debug?.web_search?.enabled, false);
  assert.equal(output.meta.search_debug?.mode, "POTENTIAL_CLIENTS_ONLY");
  assert.equal(Number(output.meta.search_debug?.candidates_from_input || 0), 0);
});

test("buyer_only mode filters vendor results and exposes vendor_filtered_count", async () => {
  const llmProvider = {
    name: "mock-llm",
    async generateJsonWithUsage({ meta } = {}) {
      if (meta?.step === "PARSE_INTENT") {
        return {
          data: {
            offer: {
              product_or_service: "платформа опросов сотрудников",
              keywords: ["опрос сотрудников", "eNPS", "пульс опросы"],
              synonyms: ["employee pulse", "engagement survey"]
            },
            icp: {
              geo: ["Россия"],
              company_size: "20-1000 сотрудников",
              industries: ["логистика", "ритейл"],
              roles: ["HRD", "COO"]
            },
            constraints: {
              language: "ru",
              must_have: [],
              must_not_have: []
            },
            buying_signal_lexicon: {
              ru: ["ищем", "нужно", "выбираем", "тендер", "закупка"],
              en: ["looking for", "need", "procurement"]
            },
            negative_lexicon: {
              ru: ["словарь", "форум"],
              en: ["dictionary", "forum"]
            }
          },
          usage: { prompt_tokens: 80, completion_tokens: 60, total_tokens: 140 }
        };
      }
      if (meta?.step === "RELEVANCE_AND_LEAD_SCORING") {
        const ids = Array.isArray(meta?.candidate_ids) ? meta.candidate_ids : [];
        return {
          data: {
            items: ids.map((candidateId, index) =>
              index === 0
                ? {
                    candidate_id: candidateId,
                    source_type: "company_page",
                    entity_role: "vendor",
                    relevance_score: 92,
                    intent_score: 78,
                    lead_type: "Warm",
                    has_buying_signal: false,
                    reason: "Это страница поставщика решения.",
                    evidence: "Тарифы, демо, возможности платформы.",
                    contact_hint: "Форма заявки на сайте."
                  }
                : {
                    candidate_id: candidateId,
                    source_type: "social_post",
                    entity_role: "buyer",
                    relevance_score: 91,
                    intent_score: 84,
                    lead_type: "Hot",
                    has_buying_signal: true,
                    reason: "Пост с явным сигналом выбора сервиса.",
                    evidence: "Ищем платформу опросов сотрудников.",
                    contact_hint: "Связаться через пост/контакты сообщества."
                  }
            )
          },
          usage: { prompt_tokens: 100, completion_tokens: 70, total_tokens: 170 }
        };
      }
      return { data: {}, usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
    }
  };

  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      workflow_mode: "hot_signals",
      search_target: "buyer_only",
      query_text: "Найди горячие лиды и исключай конкурентов/поставщиков",
      keywords: ["опрос сотрудников", "eNPS"]
    },
    {
      llmProvider,
      searchClient: {
        search: async () => ({
          ok: true,
          provider: "mock-search",
          fetched_at: new Date().toISOString(),
          duration_ms: 1,
          usage_tokens: 0,
          results: [
            {
              rank: 1,
              title: "Vendor page with pricing",
              url: "https://vendor.example.com/pricing",
              source: "vendor.example.com",
              snippet: "Наш сервис, тарифы, демо и возможности."
            },
            {
              rank: 2,
              title: "Пост: ищем платформу опросов сотрудников",
              url: "https://vk.com/wall-1_1",
              source: "vk.com",
              snippet: "Ищем платформу опросов сотрудников, собираем КП."
            }
          ]
        })
      }
    }
  );
  const output = unwrapData(envelope);

  const urls = output.hot_leads.map((lead) => String(lead.url || "").toLowerCase());
  assert.equal(urls.some((url) => url.includes("vendor.example.com")), false, "vendor lead must be filtered");
  assert.equal(Number(output.meta.search_debug?.vendor_filtered_count || 0) > 0, true);
  assert.equal(output.meta.search_debug?.search_target, "buyer_only");
});

test("rank provided list mode works without web search and returns top 10 with explanations", async () => {
  const provided = [
    "1. ООО Альфа — https://alpha.example.com/contact",
    "2. https://hh.ru/vacancy/12345 Ищем внедрение CRM",
    "3. https://t.me/s/channel/55 Нужен подрядчик на автоматизацию",
    "4. Компания Бета — внедрение платформы для заявок",
    "5. https://zakupki.gov.ru/epz/order/notice/1 тендер на внедрение",
    "6. Компания Гамма — нужен сервис обработки заявок",
    "7. https://vk.com/wall-123_456 ищем решение",
    "8. Компания Дельта",
    "9. Компания Эпсилон",
    "10. Компания Омега",
    "11. Компания Сигма",
    "12. Компания Лямбда"
  ].join("\n");

  const envelope = await generateArtemOutput(
    {
      mode: "quick",
      workflow_mode: "rank_provided_list",
      query_text: "Ранжируй мой список компаний и ссылок",
      raw_text: provided
    },
    {
      llmProvider: createMockLLMProvider(),
      webSearchEnabled: false,
      searchProvider: "none"
    }
  );
  const output = unwrapData(envelope);

  assert.equal(output.meta.status_code, "RANK_PROVIDED_LIST");
  assert.ok(Array.isArray(output.hot_leads), "has ranked leads array");
  assert.ok(output.hot_leads.length > 0 && output.hot_leads.length <= 10, "top 10 returned");
  assert.ok(Array.isArray(output.meta.rank_provided_list?.ready_messages));
  assert.ok(Number(output.meta.search_debug?.candidates_from_input || 0) >= 10);
  assert.ok(Number(output.meta.rank_provided_list?.candidates_need_domain || 0) > 0, "need_domain is tracked");
  assert.equal(
    Number(output.meta.rank_provided_list?.candidates_need_domain || 0),
    Number(output.meta.search_debug?.need_domain_count || 0),
    "need_domain counters are consistent"
  );
  assert.ok(
    Array.isArray(output.meta.rank_provided_list?.need_domain_recommendations) &&
      output.meta.rank_provided_list.need_domain_recommendations.length >= 3,
    "need_domain recommendations are exposed"
  );

  output.hot_leads.forEach((lead, index) => {
    assert.ok(typeof lead.why_match === "string" && lead.why_match.trim().length > 0, `why_match[${index}]`);
    assert.ok(typeof lead.next_action === "string" && lead.next_action.trim().length > 0, `next_action[${index}]`);
    assert.ok(typeof lead.status === "string" && lead.status.trim().length > 0, `status[${index}]`);
    if (lead.url) {
      assert.equal(/^search:\/\//i.test(lead.url), false, "no fake search url");
    }
  });
  assert.ok(
    output.hot_leads.some((lead) => String(lead.status || "").toUpperCase() === "NEED_DOMAIN"),
    "NEED_DOMAIN status is present for candidates without domain"
  );
});
