const test = require("node:test");
const assert = require("node:assert/strict");
const { runSystemAudit } = require("../lib/debug/systemAudit.js");

test("system audit returns 16 agents + board with core consistency checks", async () => {
  const report = await runSystemAudit({ runSmoke: false });

  assert.ok(report && typeof report === "object", "report object");
  assert.ok(report.data && typeof report.data === "object", "report.data");
  assert.ok(report.meta && typeof report.meta === "object", "report.meta");

  const agents = Array.isArray(report.data.agents) ? report.data.agents : [];
  assert.equal(agents.length, 16, "audit returns all 16 agents");

  const ids = agents.map((item) => item.agent_id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, "agent ids are unique");

  assert.ok(report.data.board && typeof report.data.board === "object", "board section exists");
  assert.equal(typeof report.data.board.route_exists, "boolean");
  assert.equal(typeof report.data.board.goal_exists, "boolean");
  assert.ok(Array.isArray(report.data.board.agents_present), "board agents_present array");

  const chainIds = new Set(
    (Array.isArray(report.data.chains) ? report.data.chains : []).map((chain) => chain.chain_id)
  );
  [
    "b2b_email_ready",
    "local_dm_ready",
    "hot_dm_ready",
    "competitor_positioning",
    "content_pack",
    "board_review"
  ].forEach((required) => {
    assert.ok(chainIds.has(required), `${required} chain is present`);
  });

  agents.forEach((agent) => {
    assert.equal(agent.has_registry, true, `${agent.display_name} has registry`);
    assert.equal(agent.has_config, true, `${agent.display_name} has config`);
    assert.equal(agent.has_runner, true, `${agent.display_name} has runner`);
    if (!agent.has_registry || !agent.has_config || !agent.has_runner) {
      assert.equal(agent.status, "FAIL", `${agent.display_name} must fail when core flags are missing`);
    }
  });
});
