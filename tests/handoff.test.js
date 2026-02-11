const test = require("node:test");
const assert = require("node:assert/strict");
const { agentCases } = require("./agentCases");

test("all agents provide handoff metadata", async () => {
  for (const agent of agentCases) {
    const output = await agent.fn(agent.input || {}, agent.options || {});
    assert.ok(output.meta && output.meta.handoff, `${agent.id} has handoff`);
    assert.ok(typeof output.meta.handoff.type === "string", `${agent.id} handoff type`);
    assert.equal(output.meta.handoff.version, "1.0", `${agent.id} handoff version`);
    assert.ok(
      Array.isArray(output.meta.handoff.recommended_next_agents) &&
        output.meta.handoff.recommended_next_agents.length > 0,
      `${agent.id} recommended_next_agents non-empty`
    );
  }
});
