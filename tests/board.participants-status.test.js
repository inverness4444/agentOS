const test = require("node:test");
const assert = require("node:assert/strict");
const { buildParticipantCards } = require("../lib/board/participants.js");

test("board participants: empty thread shows all Нет данных", () => {
  const cards = buildParticipantCards([], { sending: false, runError: "" });
  assert.equal(cards.length, 4);
  cards.forEach((card) => assert.equal(card.status, "Нет данных"));
});

test("board participants: 2 role messages => 2 Готово and 2 Нет данных", () => {
  const messages = [
    {
      id: "m1",
      role: "user",
      content: "test",
      created_at: "2026-02-06T10:00:00.000Z"
    },
    {
      id: "m2",
      role: "ceo",
      content: "Позиция и действия",
      created_at: "2026-02-06T10:00:01.000Z"
    },
    {
      id: "m3",
      role: "cto",
      content: "Риски и план",
      created_at: "2026-02-06T10:00:02.000Z"
    }
  ];

  const cards = buildParticipantCards(messages, { sending: false, runError: "" });
  const byRole = Object.fromEntries(cards.map((card) => [card.role, card.status]));

  assert.equal(byRole.ceo, "Готово");
  assert.equal(byRole.cto, "Готово");
  assert.equal(byRole.cfo, "Нет данных");
  assert.equal(byRole.chair, "Нет данных");
});
