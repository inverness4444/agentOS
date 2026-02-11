const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("board ui smoke: thread list and chat panel are present", () => {
  const filePath = path.join(__dirname, "..", "app", "(app)", "board", "page.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  const participantsPath = path.join(__dirname, "..", "lib", "board", "participants.js");
  const participantsSource = fs.readFileSync(participantsPath, "utf8");

  assert.ok(source.includes("Совещания"), "has threads panel");
  assert.ok(source.includes("Новый тред"), "has new thread button");
  assert.ok(source.includes("Совет директоров"), "has board title");
  assert.ok(source.includes("Участники"), "has participants section");
  assert.ok(source.includes("Отправить"), "has composer send button");
  assert.ok(source.includes("buildParticipantCards"), "uses participant status helper");

  assert.ok(participantsSource.includes("Антон — CEO (Growth)"), "has ceo card");
  assert.ok(participantsSource.includes("Юрий — CTO (Tech)"), "has cto card");
  assert.ok(participantsSource.includes("София — CFO (Risk)"), "has cfo card");
  assert.ok(participantsSource.includes("Илья — Chairman (Итог)"), "has chair card");
  assert.ok(participantsSource.includes('"Нет данных"'), "has empty participant status");
});
