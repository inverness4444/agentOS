const test = require("node:test");
const assert = require("node:assert/strict");
const { agentCases } = require("./agentCases");

test("all agents return envelope with schema_valid", async () => {
  for (const agent of agentCases) {
    const output = await agent.fn(agent.input || {}, agent.options || {});
    assert.ok(output && typeof output === "object", `${agent.id} output object`);
    assert.ok(output.data, `${agent.id} has data`);
    assert.ok(output.meta, `${agent.id} has meta`);
    assert.equal(output.meta.agent_id, agent.id, `${agent.id} agent_id matches`);
    assert.equal(
      output.meta.quality_checks.schema_valid,
      true,
      `${agent.id} schema_valid true`
    );
  }
});
