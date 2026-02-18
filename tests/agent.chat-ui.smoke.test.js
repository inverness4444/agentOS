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
  assert.ok(chatSource.includes("Открыть источник"), "chat workspace shows source button for leads");
  assert.ok(chatSource.includes("Debug"), "chat workspace has debug tab");
  assert.ok(chatSource.includes("Чат"), "chat workspace has chat tab");
  assert.ok(chatSource.includes("Диагностика поиска"), "chat workspace shows debug diagnostics section");
  assert.ok(chatSource.includes("Routing debug"), "chat workspace exposes role/task routing debug");
  assert.ok(chatSource.includes("Гео: СНГ"), "chat workspace has geo scope toggle");
  assert.ok(!chatSource.includes("Показать ответ агента"), "full answer is rendered directly");

  const chatStorePath = path.join(__dirname, "..", "lib", "agents", "chatStore.js");
  const chatStoreSource = fs.readFileSync(chatStorePath, "utf8");
  assert.ok(!chatStoreSource.includes("ещё полей"), "chat formatter has no hidden fields truncation");
  assert.ok(!chatStoreSource.includes("...ещё"), "chat formatter has no show-more ellipsis");
});
