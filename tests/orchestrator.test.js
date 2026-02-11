const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { runOrchestrator } = require("../lib/orchestrator");

const loadFixture = (agentId) => {
  const filePath = path.join(__dirname, "..", "fixtures", "agents", agentId, "output.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

test("orchestrator runs local_dm_ready steps in order", async () => {
  const maxim = loadFixture("maxim-local-leads-ru");
  const leonid = loadFixture("leonid-outreach-dm-ru");
  const boris = loadFixture("boris-bdr-operator-ru");

  const result = await runOrchestrator({
    goal: "local_dm_ready",
    inputs: { maxim, leonid, boris }
  });

  const steps = result.data.steps.map((step) => step.agent_id);
  assert.deepEqual(steps, [
    "maxim-local-leads-ru",
    "leonid-outreach-dm-ru",
    "boris-bdr-operator-ru"
  ]);
  assert.ok(Array.isArray(result.data.final.bdr_table));
  assert.equal(typeof result.data.final.csv, "string");
});

test("orchestrator flags incompatible handoff", async () => {
  const badMaxim = loadFixture("maxim-local-leads-ru");
  badMaxim.meta.handoff.compat = [];

  const result = await runOrchestrator({
    goal: "local_dm_ready",
    inputs: { maxim: badMaxim }
  });

  assert.equal(result.data.needsReview, true);
  assert.ok(
    Array.isArray(result.meta.limitations) &&
      result.meta.limitations.some((item) => item.includes("handoff format mismatch"))
  );
});
