const test = require("node:test");
const assert = require("node:assert/strict");
const { agentCases } = require("./agentCases");

const expectedCompat = {
  leads_table: [
    "anatoly-account-research-ru",
    "leonid-outreach-dm-ru",
    "emelyan-cold-email-ru",
    "boris-bdr-operator-ru"
  ],
  account_card: [
    "leonid-outreach-dm-ru",
    "emelyan-cold-email-ru",
    "boris-bdr-operator-ru"
  ],
  hot_leads: ["leonid-outreach-dm-ru", "boris-bdr-operator-ru"],
  messages_pack: ["boris-bdr-operator-ru"],
  bdr_queue: [],
  content_pack: []
};

test("handoff compat is present and matches type mapping", async () => {
  for (const agent of agentCases) {
    const output = await agent.fn(agent.input || {}, agent.options || {});
    assert.ok(output && output.meta && output.meta.handoff, `${agent.id} has handoff`);
    const { type, compat } = output.meta.handoff;
    assert.ok(Array.isArray(compat), `${agent.id} compat array`);
    const expected = expectedCompat[type];
    assert.ok(expected !== undefined, `${agent.id} type mapped`);
    expected.forEach((id) => {
      assert.ok(compat.includes(id), `${agent.id} compat includes ${id}`);
    });
    if (expected.length === 0) {
      assert.equal(compat.length, 0, `${agent.id} compat empty`);
    }
  }
});
