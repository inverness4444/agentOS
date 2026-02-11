const test = require("node:test");
const assert = require("node:assert/strict");
const { sidebarNavItems } = require("../lib/navigation/sidebarNav.js");

test("sidebar keeps required nav order and board above agents", () => {
  const order = sidebarNavItems.map((item) => item.label);
  assert.deepEqual(order, [
    "Задачи",
    "Совет директоров",
    "Агенты",
    "Инструменты",
    "Знание",
    "Биллинг"
  ]);

  const boardIndex = sidebarNavItems.findIndex((item) => item.href === "/board");
  const agentsIndex = sidebarNavItems.findIndex((item) => item.href === "/agents");
  assert.ok(boardIndex >= 0, "board nav item exists");
  assert.ok(agentsIndex >= 0, "agents nav item exists");
  assert.ok(boardIndex < agentsIndex, "board is placed above agents");
});
