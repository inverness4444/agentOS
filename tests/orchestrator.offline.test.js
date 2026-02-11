const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runOrchestrator } = require("../lib/orchestrator.js");

const loadFixture = (agentId) => {
  const filePath = path.join(__dirname, "..", "fixtures", "agents", agentId, "output.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

test("orchestrator offline local_dm_ready returns final bdr_table and csv", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";
  try {
    const maxim = loadFixture("maxim-local-leads-ru");
    const leonid = loadFixture("leonid-outreach-dm-ru");

    const result = await runOrchestrator({
      goal: "local_dm_ready",
      budget: { max_web_requests: 0 },
      inputs: {
        maxim,
        leonid
      }
    });

    assert.ok(result && result.data && result.meta, "envelope");
    assert.ok(result.meta.quality_checks.within_limits, "within_limits");
    assert.ok(result.data.final, "final exists");
    assert.ok(Array.isArray(result.data.final.bdr_table), "bdr_table array");
    assert.equal(typeof result.data.final.csv, "string", "csv string");
  } finally {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});

test("orchestrator offline b2b_email_ready returns final bdr_table and csv", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";
  try {
    const fedor = loadFixture("fedor-b2b-leads-ru");
    const emelyan = loadFixture("emelyan-cold-email-ru");

    const result = await runOrchestrator({
      goal: "b2b_email_ready",
      budget: { max_web_requests: 0 },
      inputs: {
        fedor,
        emelyan
      }
    });

    assert.ok(result && result.data && result.meta, "envelope");
    assert.ok(result.meta.quality_checks.within_limits, "within_limits");
    assert.ok(result.data.final, "final exists");
    assert.ok(Array.isArray(result.data.final.bdr_table), "bdr_table array");
    assert.equal(typeof result.data.final.csv, "string", "csv string");
  } finally {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
