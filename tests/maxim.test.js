const test = require("node:test");
const assert = require("node:assert/strict");
const { generateMaximOutput } = require("../lib/agents/maxim");
const { unwrapData } = require("./helpers");

const createMockWebClient = () => {
  const trace = [];
  return {
    search: async (query, engine, limit) => {
      return [
        { url: "https://yandex.ru/maps/org/clinic" },
        { url: "https://2gis.ru/clinic" }
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
      trace.push({ domain: new URL(url).hostname, type: url.includes("clinic.example.ru") ? "enrichment_minimal" : "card" });
      if (url.includes("clinic.example.ru")) {
        return {
          url,
          title: "Клиника — контакты",
          html: "<html><title>Контакты</title></html>",
          text: "Контакты: hello@clinic.example.ru t.me/clinichelp whatsapp"
        };
      }
      return {
        url,
        title: "Клиника — стоматология",
        html: "<html><title>Клиника</title>+7 999 111-22-33</html>",
        text:
          "Клиника стоматология рейтинг 4.5 отзывов 120 филиал 3 запись расписание оператор https://clinic.example.ru"
      };
    },
    getStats: () => ({
      requests_made: 10,
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
  search: async () => [{ url: "https://yandex.ru/maps/org/blocked" }],
  fetchPage: async (url) => ({ blocked: true, url }),
  getStats: () => ({
    requests_made: 3,
    blocked_count: 3,
    errors_count: 0,
    duration_ms: 50,
    top_errors: [],
    warnings: []
  }),
  getTrace: () => []
});

test("maxim output basics and sanitizing", async () => {
  const envelope = await generateMaximOutput(
    { query: "стоматология", geo: "Казань", mode: "quick" },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.leads), "leads array");
  output.meta.proof_items.forEach((item) => {
    assert.ok(item.evidence_snippet.length <= 160, "snippet <= 160");
    assert.equal(/<[^>]+>/.test(item.evidence_snippet), false, "no html");
  });
  assert.ok(output.leads.length <= 20, "target_count for quick");
  const keys = new Set(output.leads.map((lead) => lead.dedupe_key));
  assert.equal(keys.size, output.leads.length, "dedupe_key unique");
  output.leads.forEach((lead) => {
    assert.ok(lead.branch_count_estimate && typeof lead.branch_count_estimate === "object");
    assert.ok(Array.isArray(lead.appointment_friction_signals), "appointment_friction_signals");
    lead.appointment_friction_signals.forEach((signal) => {
      assert.ok(Array.isArray(signal.proof_refs), "signal proof_refs");
    });
    assert.ok(lead.contactability_score >= 1, "lead_quality_gate contactability");
    assert.ok(lead.pain_or_growth_signals_count >= 2, "lead_quality_gate pain/growth signals");
    if (lead.website) {
      assert.equal(lead.enrichment_minimal.checked, true, "enrichment_minimal checked");
      assert.ok(Array.isArray(lead.enrichment_minimal.proof_refs), "enrichment proof refs");
    }
  });
  assert.ok(Array.isArray(output.meta.web_stats.domains_blocked), "domains_blocked");
  assert.ok(output.meta.web_stats.sources_breakdown, "sources_breakdown");
  assert.equal(output.meta.quality_checks.no_gray_scraping, true, "no_gray_scraping true");
});

test("lead_quality_gate can reject low-quality leads", async () => {
  const envelope = await generateMaximOutput(
    {
      query: "стоматология",
      geo: "Казань",
      lead_quality_gate: { min_contactability: 3, min_pain_or_growth_signals: 5 }
    },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);
  assert.equal(output.leads.length, 0, "strict gate should filter leads");
  assert.ok(
    output.meta.quality_checks.lead_quality_gate_rejected > 0,
    "gate rejected counter should increase"
  );
});

test("blocked sources add limitations", async () => {
  const envelope = await generateMaximOutput(
    { query: "стоматология", geo: "Казань" },
    { webClient: createBlockedWebClient() }
  );
  const output = unwrapData(envelope);
  assert.ok(output.meta.limitations.length > 0, "limitations filled");
});
