const test = require("node:test");
const assert = require("node:assert/strict");

const { runAgentWithKnowledge } = require("../lib/knowledge/runWithKnowledge.js");

const stubRetrieve = async () => ({
  context: "KNOWLEDGE_CONTEXT:\n1. title: Test\nsource: note\nid: k1\nsnippet: Example",
  used: { workspace_items: 1, agent_items: 1, top_ids: ["k1"] },
  snippets: ["Example"]
});

const buildStubRunner = (capture) => async (input) => {
  capture.input = input;
  return {
    data: { ok: true },
    meta: {
      run_id: "test",
      quality_checks: { schema_valid: true },
      handoff: {
        type: "content_pack",
        version: "1.0",
        entities: {},
        recommended_next_agents: [],
        compat: []
      }
    }
  };
};

test("runAgentWithKnowledge injects knowledge context and prompt", async () => {
  const capture = { input: null };
  const result = await runAgentWithKnowledge({
    agentId: "pavel-reels-analysis-ru",
    systemPrompt: "BASE_PROMPT",
    input: { niche: "crm" },
    runner: buildStubRunner(capture),
    workspaceId: "ws",
    retrieve: stubRetrieve
  });

  assert.ok(capture.input.__knowledge_context.includes("KNOWLEDGE_CONTEXT"));
  assert.ok(capture.input.__prompt_with_knowledge.includes("KNOWLEDGE_CONTEXT"));
  assert.deepEqual(result.result.meta.knowledge_used, {
    workspace_items: 1,
    agent_items: 1,
    top_ids: ["k1"]
  });
});

test("runAgentWithKnowledge keeps prompt base for other agents", async () => {
  const capture = { input: null };
  const result = await runAgentWithKnowledge({
    agentId: "maxim-local-leads-ru",
    systemPrompt: "BASE_PROMPT_MAXIM",
    input: { query: "стоматология" },
    runner: buildStubRunner(capture),
    workspaceId: "ws",
    retrieve: stubRetrieve
  });

  assert.ok(capture.input.__prompt_with_knowledge.startsWith("BASE_PROMPT_MAXIM"));
  assert.equal(result.result.meta.knowledge_used.top_ids[0], "k1");
});
