const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectTaskType,
  buildRoutingDecision,
  applyRoleLockToInput,
  buildRoleLockFromAgent
} = require("../lib/agents/taskRouting.js");

test("timofey fast competitor task gets strict budget and item limits", () => {
  const taskType = detectTaskType("найди конкурентов QuadrantStress");
  assert.equal(taskType, "competitor_search_fast");

  const decision = buildRoutingDecision({
    runnerKey: "timofey-competitor-analysis-ru",
    taskType,
    mode: "fast",
    userText: "найди конкурентов QuadrantStress"
  });

  assert.equal(decision.outOfRole, false);
  assert.equal(decision.maxWebRequests, 4);
  assert.equal(decision.maxVisitedDomains, 3);
  assert.equal(decision.maxOutputItems.competitors, 8);

  const guarded = applyRoleLockToInput({
    input: {
      mode: "deep",
      has_web_access: true,
      max_web_requests: 99
    },
    toolsEnabled: true,
    routingDecision: decision
  });

  assert.equal(guarded.max_web_requests, 4);
  assert.equal(guarded.has_web_access, true);
  assert.equal(guarded.mode, "quick");
});

test("timofey cold email request is out-of-role and routes to outreach agent", () => {
  const taskType = detectTaskType("напиши cold email для CEO");
  assert.equal(taskType, "outreach_copy");

  const decision = buildRoutingDecision({
    runnerKey: "timofey-competitor-analysis-ru",
    taskType,
    mode: "fast",
    userText: "напиши cold email для CEO"
  });

  assert.equal(decision.outOfRole, true);
  assert.equal(decision.recommendedRunnerKey, "emelyan-cold-email-ru");
  assert.equal(decision.maxWebRequests, 0);
});

test("unknown db role key falls back to runner role mapping", () => {
  const taskType = detectTaskType("найди конкурентов в моей нише");
  const policy = buildRoleLockFromAgent({
    agent: {
      roleKey: "GENERAL_OPS",
      allowedTaskTypes: []
    },
    runnerKey: "timofey-competitor-analysis-ru"
  });
  const decision = buildRoutingDecision({
    runnerKey: "timofey-competitor-analysis-ru",
    taskType,
    mode: "fast",
    userText: "найди конкурентов в моей нише",
    agentPolicy: policy
  });

  assert.equal(policy.roleKey, "ROLE_03");
  assert.equal(decision.outOfRole, false);
});
