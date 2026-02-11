const test = require("node:test");
const assert = require("node:assert/strict");
const { runAgentsHealth } = require("../lib/debug/agentsHealth.js");

test("agents health returns 16 results in dev", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.NODE_ENV = "development";
  try {
    process.env.LLM_PROVIDER = "fake";
    const result = await runAgentsHealth();
    assert.equal(result.total, 16);
    assert.equal(result.results.length, 16);
    assert.equal(typeof result.ok, "boolean");
    assert.equal(result.llm_provider, "fake");
    assert.equal(result.offline_mode, true);
    assert.equal(result.ok, true);
    assert.equal(result.passed, 16);
    const sample = result.results[0];
    assert.ok("agent_id" in sample);
    assert.ok("ok" in sample);
    assert.ok("duration_ms" in sample);
  } finally {
    if (prevProvider === undefined) {
      delete process.env.LLM_PROVIDER;
    } else {
      process.env.LLM_PROVIDER = prevProvider;
    }
    if (prevEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevEnv;
    }
  }
});
