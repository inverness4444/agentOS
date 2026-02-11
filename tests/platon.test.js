const test = require("node:test");
const assert = require("node:assert/strict");
const {
  generatePlatonOutput,
  validatePlatonOutput
} = require("../lib/agents/platon");
const { unwrapData } = require("./helpers");

const SIGNAL_WEIGHTS = {
  marketplace_storefront: 10,
  reviews_200: 15,
  active_sku: 10,
  competitive_category: 10,
  social_posting: 10,
  social_engagement: 10,
  yandex_intent: 10,
  ops_pain: 15
};

const DEFAULT_CONFIDENCE_WEIGHTS = {
  fit_score: 0.45,
  pain_score: 0.3,
  signal_strength: 0.25
};

const createMockWebClient = () => {
  let counter = 0;
  return {
    search: async (query, engine, limit) => {
      const results = [];
      for (let i = 0; i < limit; i += 1) {
        counter += 1;
        const host = query.includes("wildberries")
          ? "https://wildberries.ru/catalog/"
          : query.includes("ozon")
            ? "https://ozon.ru/seller/"
            : "https://example.com/brand/";
        results.push({
          url: `${host}${counter}`,
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
      html: `<html><head><title>Brand ${url.split("/").pop()}</title></head><body>350 отзывов, 120 товаров, CRM, доставка. ИНН 1234567890 +7 999 111-22-33</body></html>`,
      text: "350 отзывов 120 товаров CRM доставка ИНН 1234567890 +7 999 111-22-33"
    }),
    getStats: () => ({
      requests_made: 10,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 50
    })
  };
};

const createBlockedWebClient = () => ({
  search: async (query, engine, limit) => [
    {
      url: "https://example.com/blocked",
      title: "Blocked",
      snippet: query,
      query,
      engine,
      source_url: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
    }
  ],
  fetchPage: async (url) => ({ blocked: true, url }),
  getStats: () => ({
    requests_made: 3,
    blocked_count: 3,
    errors_count: 0,
    duration_ms: 50
  })
});

const calcSignalStrength = (signals) =>
  Math.min(100, signals.reduce((sum, key) => sum + (SIGNAL_WEIGHTS[key] || 0), 0));

const calcFitScore = (signals, channel, segmentMatch) => {
  let score = 40;
  if (segmentMatch) score += 10;
  if (signals.includes("ops_pain")) score += 20;
  if (signals.includes("marketplace_storefront") && (channel === "WB" || channel === "Ozon")) {
    score += 10;
  }
  if (signals.includes("social_engagement")) score += 10;
  if (signals.includes("yandex_intent")) score += 5;
  if (signals.includes("social_posting")) score += 5;
  if (signals.includes("reviews_200")) score += 5;
  return Math.min(100, score);
};

const calcPainScore = (signals) => {
  let score = 20;
  if (signals.includes("ops_pain")) score += 45;
  if (signals.includes("reviews_200")) score += 10;
  if (signals.includes("social_engagement")) score += 15;
  if (signals.includes("yandex_intent")) score += 10;
  return Math.min(100, score);
};

const calcConfidence = (fitScore, painScore, signalStrength, weights) =>
  Math.round(
    fitScore * weights.fit_score +
      painScore * weights.pain_score +
      signalStrength * weights.signal_strength
  );

test("empty input yields enriched segments + candidates", async () => {
  const envelope = await generatePlatonOutput({}, { webClient: createMockWebClient() });
  const output = unwrapData(envelope);
  const validation = validatePlatonOutput(output, {
    mode: "deep",
    min_confidence: 40,
    require_signals: true
  });

  assert.equal(validation.valid, true, validation.errors.join("\n"));

  assert.ok(
    output.segments.length >= 5 && output.segments.length <= 8,
    "segments length should be 5-8"
  );

  output.segments.forEach((segment) => {
    assert.ok(Array.isArray(segment.antiICP) && segment.antiICP.length >= 1, "antiICP required");
    assert.ok(
      Array.isArray(segment.minimum_viable_signals) &&
        segment.minimum_viable_signals.length >= 2 &&
        segment.minimum_viable_signals.length <= 3,
      "minimum_viable_signals should be 2-3"
    );
  });

  assert.ok(
    output.company_candidates.length >= 15,
    "company_candidates should be at least 15"
  );

  output.company_candidates.forEach((candidate) => {
    if (!candidate.low_quality) {
      assert.ok(candidate.confidence >= 40, "confidence >= min_confidence");
    }
    assert.ok(candidate.source_proof.length >= 2, "candidate should include 2+ proofs");
    assert.ok(Array.isArray(candidate.proof_refs) && candidate.proof_refs.length > 0, "proof_refs required");
    assert.ok(
      Array.isArray(candidate.why_here_proof_refs) &&
        candidate.why_here_proof_refs.length >= 1 &&
        candidate.why_here_proof_refs.length <= 2,
      "why_here_proof_refs should be 1-2"
    );
  });
});

test("exclude_list prevents duplicates", async () => {
  const output = unwrapData(await generatePlatonOutput({}, { webClient: createMockWebClient() }));
  const first = output.company_candidates[0];
  assert.ok(first, "should have a candidate");
  const dedupe = first.dedupe_key;
  const outputExcluded = unwrapData(await generatePlatonOutput(
    { exclude_list: [dedupe] },
    { webClient: createMockWebClient() }
  ));
  const hasDup = outputExcluded.company_candidates.some(
    (candidate) => candidate.dedupe_key === dedupe
  );
  assert.equal(hasDup, false, "exclude_list should remove candidate");
});

test("segments_only, targets_only and seed_only modes", async () => {
  const segmentsOnly = unwrapData(await generatePlatonOutput(
    { mode: "segments_only" },
    { webClient: createMockWebClient() }
  ));
  assert.equal(segmentsOnly.company_candidates.length, 0, "no candidates");
  assert.ok(
    segmentsOnly.segments.length >= 5 && segmentsOnly.segments.length <= 8,
    "segments_only should return segments"
  );

  const targetsOnly = unwrapData(await generatePlatonOutput(
    { mode: "targets_only" },
    { webClient: createMockWebClient() }
  ));
  assert.equal(targetsOnly.segments.length, 0, "no segments");
  assert.ok(
    targetsOnly.company_candidates.length >= 15,
    "targets_only should return candidates"
  );

  const seedOnly = unwrapData(await generatePlatonOutput(
    { mode: "seed_only" },
    { webClient: createMockWebClient() }
  ));
  assert.equal(seedOnly.company_candidates.length, 0, "seed_only has no candidates");
  assert.ok(seedOnly.segments.length >= 5, "seed_only returns segments");
  assert.ok(
    seedOnly.meta.search_plan && Array.isArray(seedOnly.meta.search_plan.queries_used),
    "seed_only should include search_plan"
  );
});

test("confidence decomposition follows weighted formula", async () => {
  const customWeights = {
    fit_score: 0.5,
    pain_score: 0.25,
    signal_strength: 0.25
  };
  const output = unwrapData(await generatePlatonOutput(
    { confidence_weights: customWeights },
    { webClient: createMockWebClient() }
  ));
  const candidate = output.company_candidates[0];
  const signals = candidate.source_proof.map((item) => item.signal_type);

  const fitScore = calcFitScore(signals, candidate.channel, candidate.segment_match);
  const painScore = calcPainScore(signals);
  const signalStrength = calcSignalStrength(signals);
  const expectedConfidence = calcConfidence(fitScore, painScore, signalStrength, customWeights);

  assert.equal(candidate.fit_score, fitScore, "fit_score should match formula");
  assert.equal(candidate.pain_score, painScore, "pain_score should match formula");
  assert.equal(candidate.signal_strength, signalStrength, "signal_strength should match formula");
  assert.equal(candidate.confidence, expectedConfidence, "confidence should match weighted formula");
  assert.deepEqual(output.meta.confidence_weights, customWeights, "weights should be exposed in meta");
});

test("default weights are used when not provided", async () => {
  const output = unwrapData(await generatePlatonOutput({}, { webClient: createMockWebClient() }));
  assert.deepEqual(
    output.meta.confidence_weights,
    DEFAULT_CONFIDENCE_WEIGHTS,
    "default confidence weights should be stable"
  );
});

test("last_run exclude_list removes previous candidates", async () => {
  const mockClient = createMockWebClient();
  const firstRun = unwrapData(await generatePlatonOutput({}, { webClient: mockClient }));
  const prior = firstRun.company_candidates[0];
  const output = unwrapData(await generatePlatonOutput(
    {},
    {
      webClient: createMockWebClient(),
      last_run: { company_candidates: [prior] }
    }
  ));
  const hasDup = output.company_candidates.some(
    (candidate) => candidate.dedupe_key === prior.dedupe_key
  );
  assert.equal(hasDup, false, "last_run should exclude previous candidate");
});

test("blocked sources fall back to placeholders when allowed", async () => {
  const output = unwrapData(await generatePlatonOutput(
    { allow_placeholders_if_blocked: true },
    { webClient: createBlockedWebClient() }
  ));
  assert.ok(output.company_candidates.length >= 15, "should return placeholders");
  assert.ok(
    output.company_candidates.some((candidate) => candidate.estimate),
    "placeholders should be marked estimate"
  );
  assert.ok(
    output.meta.rejected_candidates.length >= 1,
    "rejected_candidates should include blocked items"
  );
});

test("evidence snippets and why_here are grounded and short", async () => {
  const output = unwrapData(await generatePlatonOutput({}, { webClient: createMockWebClient() }));
  output.company_candidates.forEach((candidate) => {
    candidate.source_proof.forEach((proof) => {
      assert.ok(proof.evidence_snippet.length <= 160, "snippet <= 160 chars");
      assert.equal(proof.evidence_snippet.includes("<"), false, "no HTML tags");
      assert.equal(proof.evidence_snippet.includes("\n"), false, "no newlines");
    });
    assert.ok(candidate.why_here.length <= 340, "why_here should be concise");
    candidate.why_here_proof_refs.forEach((ref) => {
      assert.ok(ref >= 0 && ref < candidate.source_proof.length, "why_here refs in range");
    });
  });
});

test("dedupe_report is deterministic and consistent", async () => {
  const runA = unwrapData(await generatePlatonOutput({}, { webClient: createMockWebClient() }));
  const runB = unwrapData(await generatePlatonOutput({}, { webClient: createMockWebClient() }));

  assert.deepEqual(runA.meta.dedupe_report, runB.meta.dedupe_report, "dedupe_report should be stable");
  const report = runA.meta.dedupe_report;
  assert.equal(typeof report.scanned_total, "number");
  assert.equal(typeof report.kept_total, "number");
  assert.equal(typeof report.removed_total, "number");
  assert.ok(report.scanned_total >= report.kept_total, "scanned >= kept");
});
