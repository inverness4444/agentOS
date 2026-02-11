const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  FakeLLMProvider,
  buildFromSchema,
  stripVolatile
} = require("../lib/llm/provider.js");

const fixturesRoot = path.join(__dirname, "..", "fixtures", "agents");

const loadFixtureData = (agentId) => {
  const outputPath = path.join(fixturesRoot, agentId, "output.json");
  const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  return stripVolatile(parsed.data || parsed);
};

test("fake provider returns fixture-backed data for known agents", async () => {
  const provider = new FakeLLMProvider({ fixturesRoot });
  const agentIds = [
    "platon-prospect-research-ru",
    "boris-bdr-operator-ru",
    "mitya-workflow-diagram-ru"
  ];

  for (const agentId of agentIds) {
    const actual = await provider.generateJson({
      system: "stub",
      prompt: "stub",
      schema: { type: "object" },
      meta: { agent_id: agentId }
    });

    const expected = loadFixtureData(agentId);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${agentId} keys`);
    assert.equal(typeof actual.meta, "object", `${agentId} meta object`);
  }
});

test("schema-driven fallback builds minimal valid JSON when fixture missing", async () => {
  const provider = new FakeLLMProvider({ fixturesRoot });
  const schema = {
    type: "object",
    required: ["items", "status", "meta"],
    properties: {
      status: { type: "string", enum: ["ok", "warn"] },
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "score"],
          properties: {
            name: { type: "string" },
            score: { type: "number" }
          }
        }
      },
      meta: {
        type: "object",
        required: ["generated_at"],
        properties: {
          generated_at: { type: "string", format: "date-time" }
        }
      }
    }
  };

  const output = await provider.generateJson({
    system: "stub",
    prompt: "stub",
    schema,
    meta: { agent_id: "unknown-agent-id" }
  });

  assert.equal(output.status, "ok");
  assert.ok(Array.isArray(output.items) && output.items.length >= 1, "items generated");
  assert.equal(typeof output.items[0].name, "string");
  assert.equal(typeof output.items[0].score, "number");
  assert.equal(typeof output.meta.generated_at, "string");

  const fromBuilder = buildFromSchema(schema);
  assert.ok(fromBuilder && typeof fromBuilder === "object", "schema builder returns object");
});
