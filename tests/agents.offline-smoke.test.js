const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listAgentRunners } = require("../lib/agents/runnerRegistry.js");
const { getLLMProvider } = require("../lib/llm/provider.js");
const { wrapAgentOutput } = require("../utils/agentEnvelope.js");

const fixturesRoot = path.join(__dirname, "..", "fixtures", "agents");

const clone = (value) => JSON.parse(JSON.stringify(value));

const loadFixtureInput = (agentId) => {
  const filePath = path.join(fixturesRoot, agentId, "input.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
};

const forceOffline = (input) => {
  const next = clone(input || {});
  next.has_web_access = false;
  next.max_web_requests = 0;
  next.budget = {
    ...(next.budget && typeof next.budget === "object" ? next.budget : {}),
    max_web_requests: 0
  };
  return next;
};

const hasMeaningfulValue = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    return value.some((item) => hasMeaningfulValue(item));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return false;
    return entries.some(([, val]) => hasMeaningfulValue(val));
  }
  return false;
};

test("all 16 agents return valid envelope in offline fake mode", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  try {
    const runners = listAgentRunners();
    assert.equal(runners.length, 16, "runner registry has 16 agents");
    const provider = getLLMProvider({ forceNew: true, provider: "fake" });

    for (const runner of runners) {
      const input = forceOffline(loadFixtureInput(runner.agentId));
      const fakeData = await provider.generateJson({
        system: runner.systemPrompt,
        prompt: JSON.stringify(input),
        schema: runner.outputSchema,
        temperature: 0,
        maxTokens: 800,
        meta: { agent_id: runner.agentId, registry_id: runner.registryId }
      });
      const envelope = wrapAgentOutput({
        agentId: runner.agentId,
        inputEcho: input,
        mode: "offline_smoke_fake",
        legacyOutput: fakeData
      });

      assert.ok(envelope && typeof envelope === "object", `${runner.agentId} envelope object`);
      assert.ok(envelope.data && typeof envelope.data === "object", `${runner.agentId} has data`);
      assert.ok(envelope.meta && typeof envelope.meta === "object", `${runner.agentId} has meta`);
      assert.equal(envelope.meta.agent_id, runner.agentId, `${runner.agentId} agent_id`);
      assert.equal(
        envelope.meta.quality_checks?.schema_valid,
        true,
        `${runner.agentId} schema_valid=true`
      );
      assert.equal(
        envelope.meta.quality_checks?.llm_connected,
        false,
        `${runner.agentId} llm_connected=false in fake mode`
      );
      assert.ok(
        envelope.meta.handoff && typeof envelope.meta.handoff.type === "string",
        `${runner.agentId} handoff.type`
      );

      const dataKeys = Object.keys(envelope.data).filter((key) => key !== "meta");
      assert.ok(dataKeys.length > 0, `${runner.agentId} data has business keys`);

      const meaningful = dataKeys.some((key) => hasMeaningfulValue(envelope.data[key]));
      const seedOnlyOk =
        Array.isArray(envelope.data.segments) &&
        envelope.data.segments.length > 0 &&
        envelope.data.search_plan;
      const safeBaselineOk =
        Array.isArray(envelope.data?.meta?.limitations) &&
        envelope.data.meta.limitations.length > 0;

      assert.ok(
        meaningful || seedOnlyOk || safeBaselineOk,
        `${runner.agentId} data should be meaningful in offline mode`
      );
    }
  } finally {
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
