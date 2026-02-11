const test = require("node:test");
const assert = require("node:assert/strict");

const { retrieveFromItems } = require("../utils/knowledge.js");

test("knowledge retrieval prioritizes agent scope", () => {
  const items = [
    {
      id: "agent-1",
      title: "Agent CRM",
      contentText: "crm лиды",
      scope: "agent"
    },
    {
      id: "ws-1",
      title: "Workspace CRM",
      contentText: "crm лиды",
      scope: "workspace"
    }
  ];

  const result = retrieveFromItems(items, "crm лиды", { topK: 1 });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].id, "agent-1");
  assert.equal(result.used.agent_items, 1);
  assert.equal(result.used.workspace_items, 0);
});

test("knowledge retrieval respects top_k and dedupes", () => {
  const items = [
    {
      id: "agent-1",
      title: "Agent CRM",
      contentText: "crm лиды",
      contentHash: "dup",
      scope: "agent"
    },
    {
      id: "ws-1",
      title: "Workspace CRM",
      contentText: "crm лиды",
      contentHash: "dup",
      scope: "workspace"
    },
    {
      id: "ws-2",
      title: "Workspace Marketing",
      contentText: "crm маркетинг",
      scope: "workspace"
    }
  ];

  const result = retrieveFromItems(items, "crm маркетинг", { topK: 2 });
  assert.equal(result.results.length, 2);
  const ids = result.results.map((item) => item.id);
  assert.ok(ids.includes("agent-1"));
  assert.ok(ids.includes("ws-2"));
});
