const test = require("node:test");
const assert = require("node:assert/strict");
const { generateBorisOutput } = require("../lib/agents/boris");
const { unwrapData } = require("./helpers");

test("boris sets needsReview on handoff mismatch", async () => {
  const output = await generateBorisOutput({
    inputs: { maxim_leads_json: { leads: [] } }
  });
  const data = unwrapData(output);
  assert.equal(data.meta.needsReview, true);
  assert.ok(
    Array.isArray(data.meta.limitations) &&
      data.meta.limitations.includes("handoff format mismatch")
  );
});
