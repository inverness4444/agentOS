const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("agent page defaults to chat workspace and includes history UI", () => {
  const pagePath = path.join(__dirname, "..", "app", "(app)", "agents", "[id]", "page.tsx");
  const pageSource = fs.readFileSync(pagePath, "utf8");
  const chatPath = path.join(__dirname, "..", "components", "agents", "AgentChatWorkspace.tsx");
  const chatSource = fs.readFileSync(chatPath, "utf8");

  assert.ok(pageSource.includes("AgentChatWorkspace"), "agent detail uses chat workspace component");
  assert.ok(
    pageSource.includes('return tab === "build" ? "build" : "run";'),
    "agent detail defaults to run/chat tab"
  );

  assert.ok(chatSource.includes("История"), "chat workspace has history panel");
  assert.ok(chatSource.includes("Новый тред"), "chat workspace has new thread action");
  assert.ok(chatSource.includes("Отправить"), "chat workspace has send button");
  assert.ok(chatSource.includes("печатает..."), "chat workspace has typing state");
});
