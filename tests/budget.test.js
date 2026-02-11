const test = require("node:test");
const assert = require("node:assert/strict");
const { generatePlatonOutput } = require("../lib/agents/platon");
const { generatePavelOutput } = require("../lib/agents/pavel");
const { generateBorisOutput } = require("../lib/agents/boris");

const createMockWebClient = () => {
  let counter = 0;
  return {
    search: async (query, engine, limit) => {
      const results = [];
      for (let i = 0; i < limit; i += 1) {
        counter += 1;
        results.push({
          url: `https://example.com/brand/${counter}`,
          title: `Brand ${counter}`,
          snippet: query,
          query,
          engine,
          source_url: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
        });
      }
      return results;
    },
    fetchPage: async (url) => ({
      url,
      title: `Brand ${url.split("/").pop()}`,
      html: "<html><body>350 отзывов, CRM, доставка.</body></html>",
      text: "350 отзывов CRM доставка"
    }),
    getStats: () => ({
      requests_made: 10,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 50
    })
  };
};

test("budget clamps web agent items and sets warning", async () => {
  const output = await generatePlatonOutput(
    {
      mode: "quick",
      has_web_access: true,
      allow_placeholders_if_no_web: true,
      target_count: 6,
      budget: { max_items: 2 }
    },
    { webClient: createMockWebClient() }
  );
  assert.equal(output.meta.budget_applied.max_items, 2);
  assert.ok(output.meta.warnings.includes("budget_clamped"));
  assert.ok(output.data.company_candidates.length <= 2);
});

test("budget overrides max_words for content agent", async () => {
  const output = await generatePavelOutput({
    input_content: { transcript: "0–3: хук. 3–15: ценность. 15–30: proof. CTA." },
    constraints: { max_words: 350 },
    budget: { max_words: 120 }
  });
  assert.equal(output.meta.budget_applied.max_words, 120);
  assert.equal(output.meta.input_echo.constraints.max_words, 120);
  assert.ok(output.meta.warnings.includes("budget_clamped"));
});

test("budget clamps boris max_items", async () => {
  const envelope = {
    data: {
      leads: [
        { name: "Lead A", dedupe_key: "a", website: "https://a.com" },
        { name: "Lead B", dedupe_key: "b", website: "https://b.com" }
      ],
      meta: { generated_at: new Date().toISOString() }
    },
    meta: {
      agent_id: "maxim-local-leads-ru",
      generated_at: new Date().toISOString(),
      run_id: "fixture",
      mode: "quick",
      input_echo: {},
      quality_checks: {
        no_fabrication: true,
        within_limits: true,
        schema_valid: true,
        dedupe_ok: true,
        grounding_ok: true
      },
      limitations: [],
      assumptions: [],
      handoff: {
        type: "leads_table",
        version: "1.0",
        entities: { leads: [] },
        recommended_next_agents: [],
        compat: ["boris-bdr-operator-ru"]
      },
      web_stats: null
    }
  };

  const output = await generateBorisOutput({
    budget: { max_items: 1 },
    inputs: { maxim_leads_json: envelope }
  });
  assert.equal(output.meta.budget_applied.max_items, 1);
  assert.ok(output.meta.warnings.includes("budget_clamped"));
  assert.equal(output.data.bdr_table.length, 1);
});
