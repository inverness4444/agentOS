const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("knowledge page supports selecting target scope and agent", () => {
  const pagePath = path.join(__dirname, "..", "app", "(app)", "knowledge", "page.tsx");
  const source = fs.readFileSync(pagePath, "utf8");

  assert.ok(source.includes("Применять к"));
  assert.ok(source.includes("Все агенты"));
  assert.ok(source.includes("Конкретный агент"));
  assert.ok(source.includes("scope: knowledgeScope"));
  assert.ok(source.includes('agent_id: knowledgeScope === "agent" ? knowledgeAgentId : undefined'));
  assert.ok(source.includes("Для: все агенты"));
});

test("knowledge api supports workspace and agent scope with validation", () => {
  const routePath = path.join(__dirname, "..", "app", "api", "knowledge", "route.ts");
  const source = fs.readFileSync(routePath, "utf8");

  assert.ok(source.includes('scope: { in: ["workspace", "agent"] }'));
  assert.ok(source.includes("agent_id"));
  assert.ok(source.includes("agent not found for workspace"));
});
