const test = require("node:test");
const assert = require("node:assert/strict");
const { RealLLMProvider } = require("../lib/llm/provider.js");

test("real provider requires OPENAI_API_KEY", async () => {
  const provider = new RealLLMProvider({ apiKey: "" });
  await assert.rejects(
    () => provider.generateJson({ prompt: "{}", schema: { type: "object" } }),
    /OPENAI_API_KEY is required/
  );
});

test("real provider parses JSON response from chat completions", async () => {
  const calls = [];
  const provider = new RealLLMProvider({
    apiKey: "test-key",
    model: "gpt-4o-mini",
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: "{\"ok\":true,\"items\":[{\"name\":\"stub\"}]}" } }]
          });
        }
      };
    }
  });

  const result = await provider.generateJson({
    system: "You are JSON only",
    prompt: "{\"task\":\"smoke\"}",
    schema: {
      type: "object",
      required: ["ok", "items"],
      properties: {
        ok: { type: "boolean" },
        items: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" } } }
        }
      }
    },
    meta: { agent_id: "test-agent" }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.items));
  assert.equal(result.items[0].name, "stub");
});
