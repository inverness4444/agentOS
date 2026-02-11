const { generateOutput } = require("../lib/agents/platon");
const { WebClient } = require("../lib/agents/webClient.js");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

(async () => {
  const input = {
    mode: "quick",
    industry_or_niche: "кофейни",
    geo: "Москва",
    channel: "OfflineServices",
    max_web_requests: 20,
    target_count: 12,
    require_signals: true
  };

  const webClient = new WebClient({ maxRequests: input.max_web_requests });
  const result = await generateOutput(input, { webClient });
  const output = result.output;

  const candidates = output.company_candidates || [];
  assert(candidates.length >= 8, "company_candidates should be >= 8");

  const dedupe = new Set();
  candidates.forEach((candidate) => {
    assert(candidate.source_proof && candidate.source_proof.length >= 2, "source_proof >= 2");
    assert(!dedupe.has(candidate.dedupe_key), "no duplicate dedupe_key");
    dedupe.add(candidate.dedupe_key);
  });

  const stats = output.meta.web_stats;
  assert(stats.requests_made <= input.max_web_requests, "requests_made <= max_web_requests");
  const sources = stats.sources_used;
  const totalSources = Object.values(sources).reduce((sum, value) => sum + value, 0);
  assert(totalSources > 0, "sources_used should not be empty");

  console.log("Platon smoke test passed.");
  console.log("Candidates:", candidates.length);
  console.log("Web stats:", stats);
})().catch((error) => {
  console.error("Platon smoke test failed:", error.message);
  process.exit(1);
});
