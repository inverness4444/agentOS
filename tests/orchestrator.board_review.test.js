const test = require("node:test");
const assert = require("node:assert/strict");
const { runOrchestrator } = require("../lib/orchestrator");

test("orchestrator board_review returns 4 steps and final payload", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  try {
    const result = await runOrchestrator({
      goal: "board_review",
      inputs: {
        board: {
          idea: "Запустить новый тариф для SMB",
          goal: "рост",
          constraints: "Бюджет до 500к",
          context: "Есть текущая клиентская база",
          critique_level: "норм"
        }
      },
      budget: { max_words: 700 }
    });

    assert.ok(result && typeof result === "object");
    assert.equal(result.meta?.handoff?.type, "board_review");
    assert.ok(Array.isArray(result.data?.steps), "steps array");
    assert.equal(result.data.steps.length, 4, "should run 4 board steps");

    const stepIds = result.data.steps.map((step) => step.step_id);
    assert.deepEqual(stepIds, ["board_ceo", "board_cto", "board_cfo", "board_chair"]);

    const final = result.data?.final || {};
    assert.equal(typeof final.ceo, "object");
    assert.equal(typeof final.cto, "object");
    assert.equal(typeof final.cfo, "object");
    assert.equal(typeof final.chairman, "object");
    assert.ok(Array.isArray(final.chairman?.seven_day_plan), "chair plan array");
  } finally {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
