const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAnatolyOutput } = require("../lib/agents/anatoly");
const { unwrapData } = require("./helpers");

const createSiteWebClient = (options = {}) => {
  const trace = [];
  const searchCalls = [];
  const fetchCalls = [];
  const withPrices = options.withPrices !== false;
  const withAudienceHints = options.withAudienceHints !== false;

  const pages = {
    "https://quadrantstress.ru/":
      `<html><title>QuadrantStress — пульс-опросы по стрессу</title>
       <a href="/pricing">pricing</a>
       <a href="/contacts">contacts</a>
       <a href="https://t.me/quadrantstress">tg</a>
       <form></form>
       support@quadrantstress.ru
       </html>`,
    "https://quadrantstress.ru/about":
      `<html><title>О компании QuadrantStress</title>
       ${withAudienceHints ? "Решение для компаний 50-1000 сотрудников." : "Платформа для команд."}
       </html>`,
    "https://quadrantstress.ru/pricing":
      `<html><title>Тарифы</title>${withPrices ? "Базовый 12900 ₽, Pro 45900 ₽" : "Запросить демо"}</html>`,
    "https://quadrantstress.ru/contacts":
      `<html><title>Контакты</title>+7 999 111-22-33</html>`
  };

  return {
    searchCalls,
    fetchCalls,
    search: async (query, engine, limit) => {
      searchCalls.push({ query, engine, limit });
      return [];
    },
    fetchPage: async (url) => {
      const normalized = String(url || "").replace(/\/+$/, "") || url;
      const mappedUrl = normalized === "https://quadrantstress.ru" ? "https://quadrantstress.ru/" : normalized;
      const html = pages[mappedUrl];
      fetchCalls.push(mappedUrl);
      if (!html) {
        trace.push({ domain: "quadrantstress.ru", type: "page" });
        return { blocked: true, url: mappedUrl };
      }
      trace.push({ domain: "quadrantstress.ru", type: "page" });
      return {
        url: mappedUrl,
        title: (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || "",
        html,
        text: html.replace(/<[^>]+>/g, " ")
      };
    },
    getStats: () => ({
      requests_made: trace.length,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 50,
      top_errors: [],
      warnings: []
    }),
    getTrace: () => trace
  };
};

const createBlockedWebClient = () => {
  const searchCalls = [];
  return {
    searchCalls,
    search: async (query, engine, limit) => {
      searchCalls.push({ query, engine, limit });
      return [
        { url: "https://quadrantstress.ru/" },
        { url: "https://vk.com/quadrantstress" },
        { url: "https://wikipedia.org/wiki/Stress" }
      ];
    },
    fetchPage: async (url) => ({ blocked: true, url }),
    getStats: () => ({
      requests_made: 8,
      blocked_count: 8,
      errors_count: 0,
      duration_ms: 50,
      top_errors: [],
      warnings: []
    }),
    getTrace: () => []
  };
};

test("empty input asks for clarification and returns safe baseline", async () => {
  const envelope = await generateAnatolyOutput({}, { webClient: createSiteWebClient() });
  const output = unwrapData(envelope);
  assert.ok(
    output.meta.limitations.some((item) => item.includes("пришлите ссылку")),
    "should ask for clarification"
  );
  assert.equal(output.account_card.needsReview, true, "needsReview true");
  assert.ok(
    Array.isArray(output.account_card.quick_audit_checklist) &&
      output.account_card.quick_audit_checklist.length >= 8,
    "safe checklist should be present"
  );
});

test("company analysis uses target domain only and does not run web search when site is available", async () => {
  const webClient = createSiteWebClient();
  const envelope = await generateAnatolyOutput(
    { company_domain_or_url: "https://quadrantstress.ru/" },
    { webClient }
  );
  const output = unwrapData(envelope);

  assert.equal(webClient.searchCalls.length, 0, "search must be disabled when site is reachable");
  assert.ok(
    output.account_card.primary_url.startsWith("https://quadrantstress.ru"),
    "primary_url uses target website"
  );
  assert.ok(
    output.meta.seed_urls.every((url) => String(url).includes("quadrantstress.ru")),
    "seed urls must belong to target domain"
  );
  assert.ok(
    output.meta.proof_items.every((item) => String(item.url).includes("quadrantstress.ru")),
    "proof items must come from target domain"
  );
  assert.ok(
    output.meta.user_facing_sources.every((url) => {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return host === "quadrantstress.ru" || host === "t.me";
    }),
    "user-facing sources contain only target domain and official channels"
  );
});

test("who_they_sell_to is never empty and becomes hypothesis when explicit ICP is missing", async () => {
  const envelope = await generateAnatolyOutput(
    { company_domain_or_url: "https://quadrantstress.ru/" },
    { webClient: createSiteWebClient({ withAudienceHints: false }) }
  );
  const output = unwrapData(envelope);
  assert.ok(String(output.account_card.who_they_sell_to || "").trim().length > 0, "who_they_sell_to filled");
  assert.match(output.account_card.who_they_sell_to, /hypothesis/i, "contains explicit hypothesis marker");
});

test("avg check is unknown when no public prices are found", async () => {
  const envelope = await generateAnatolyOutput(
    { company_domain_or_url: "https://quadrantstress.ru/" },
    { webClient: createSiteWebClient({ withPrices: false }) }
  );
  const output = unwrapData(envelope);
  assert.equal(output.account_card.avg_check_estimate.estimate, true, "avg check remains estimate");
  assert.equal(output.account_card.avg_check_estimate.value_range_rub, "unknown", "no fabricated price range");
  assert.equal(
    output.account_card.avg_check_estimate.estimate_basis,
    "unknown_no_public_prices",
    "explicit unknown basis"
  );
});

test("fallback search is limited and marked as external_context when target site is unavailable", async () => {
  const webClient = createBlockedWebClient();
  const envelope = await generateAnatolyOutput(
    { company_domain_or_url: "https://quadrantstress.ru/" },
    { webClient }
  );
  const output = unwrapData(envelope);
  assert.ok(webClient.searchCalls.length <= 3, "fallback search uses at most 3 queries");
  assert.ok(Array.isArray(output.meta.external_context), "external_context exists");
  assert.ok(
    output.meta.external_context.every((item) => item.type === "external_context" || item.type === "mirror_or_cache"),
    "external_context types are explicit"
  );
  assert.ok(
    output.meta.proof_items.every((item) => String(item.url).includes("quadrantstress.ru")),
    "external context must not be mixed into proof_items"
  );
  assert.equal(output.account_card.needsReview, true, "needsReview true on unavailable target");
});
