const test = require("node:test");
const assert = require("node:assert/strict");
const { generateArtemOutput } = require("../lib/agents/artem");
const { unwrapData } = require("./helpers");

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

test("artem output basics and scoring", async () => {
  const envelope = await generateArtemOutput(
    { focus: "crm", mode: "quick", min_hot_score: 60 },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.hot_leads), "hot_leads array");
  assert.ok(output.hot_leads.length > 0, "has hot leads");
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
    { webClient: createBlockedWebClient() }
  );
  const output = unwrapData(envelope);
  assert.ok(output.meta.limitations.length > 0, "limitations filled");
});
