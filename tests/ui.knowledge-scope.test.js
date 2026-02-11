const test = require("node:test");
const assert = require("node:assert/strict");

const { attachKnowledgeLink, detachKnowledgeLink } = require("../utils/knowledgeLinks.js");

test("detach knowledge link does not delete knowledge item", () => {
  const items = [{ id: "k1", title: "Doc" }];
  const links = attachKnowledgeLink([], { id: "l1", knowledgeId: "k1", agentId: "a1" });

  const afterDetach = detachKnowledgeLink(links, "l1");

  assert.equal(afterDetach.length, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "k1");
});
