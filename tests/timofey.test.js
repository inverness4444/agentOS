const test = require("node:test");
const assert = require("node:assert/strict");
const { generateTimofeyOutput } = require("../lib/agents/timofey");
const { unwrapData } = require("./helpers");

const createMockWebClient = () => {
  const trace = [];
  return {
    search: async (query, engine, limit) => {
      const results = [
        { url: "https://competitor-a.ru" },
        { url: "https://competitor-b.ru" }
      ];
      return results.slice(0, limit).map((item) => ({
        ...item,
        title: "Result",
        snippet: query,
        query,
        engine,
        source_url: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
      }));
    },
    fetchPage: async (url) => {
      trace.push({ domain: new URL(url).hostname, type: "page" });
      if (url.includes("competitor-a.ru")) {
        return {
          url,
          title: "Competitor A",
          html: "<html><title>Competitor A</title>от 30000 ₽ кейсы</html>",
          text: "от 30000 ₽ кейсы запуск за 7 дней"
        };
      }
      return {
        url,
        title: "Competitor B",
        html: "<html><title>Competitor B</title>по запросу</html>",
        text: "по запросу"
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

test("timofey output structure and proofs", async () => {
  const envelope = await generateTimofeyOutput({}, { webClient: createMockWebClient() });
  const output = unwrapData(envelope);
  const fixedColumns = [
    "УТП",
    "сегменты",
    "оффер",
    "цены",
    "кейсы",
    "гарантии",
    "скорость",
    "договор/акты",
    "каналы",
    "слабые места"
  ];

  assert.ok(Array.isArray(output.competitors), "competitors array");
  assert.ok(output.pricing_evidence && typeof output.pricing_evidence === "object", "pricing_evidence");
  assert.ok(Array.isArray(output.comparison_table), "comparison_table array");
  assert.equal(output.win_angles.length, 3, "win_angles exactly 3");
  assert.ok(output.offers.sellers_offer && output.offers.local_offer && output.offers.b2b_offer, "offers present");
  assert.ok(output.offers.sellers_offer.risk_reversal, "risk_reversal present");
  assert.ok(output.offers.sellers_offer.first_step, "first_step present");

  output.meta.proof_items.forEach((item) => {
    assert.ok(item.evidence_snippet.length <= 160, "snippet <= 160");
    assert.equal(/<[^>]+>/.test(item.evidence_snippet), false, "no html");
  });

  assert.ok(output.comparison_table.length > 0, "comparison_table not empty");
  output.comparison_table.forEach((row) => {
    assert.deepEqual(row.column_order, fixedColumns, "fixed column order");
    fixedColumns.forEach((column) => {
      assert.ok(row.columns[column], `column ${column} exists`);
      assert.ok(Array.isArray(row.columns[column].proof_refs), `${column} has proof_refs`);
    });
  });
  output.win_angles.forEach((angle) => {
    assert.ok(typeof angle.what_to_say === "string" && angle.what_to_say.length > 0);
    assert.ok(typeof angle.proof_to_show === "string" && angle.proof_to_show.length > 0);
    assert.ok(typeof angle.target_segment === "string" && angle.target_segment.length > 0);
    assert.ok(Array.isArray(angle.proof_refs), "angle proof_refs");
  });
  assert.ok(
    typeof output.meta.quality_checks.proof_coverage_ratio === "number" &&
      output.meta.quality_checks.proof_coverage_ratio >= 0 &&
      output.meta.quality_checks.proof_coverage_ratio <= 1,
    "proof_coverage_ratio 0..1"
  );
  assert.ok(output.meta.quality_checks.no_fabrication, "no_fabrication true");
});

test("unknown flags for pricing/cases", async () => {
  const envelope = await generateTimofeyOutput({}, { webClient: createMockWebClient() });
  const output = unwrapData(envelope);
  const competitorB = output.competitors.find((item) => item.name.includes("competitor-b") || item.primary_url.includes("competitor-b"));
  assert.ok(competitorB, "competitor B exists");
  assert.equal(competitorB.cases.unknown, true, "cases unknown when no case proof");
});
