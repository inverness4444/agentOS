const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("board page renders chat ui and board api calls", () => {
  const filePath = path.join(__dirname, "..", "app", "(app)", "board", "page.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  const participantsPath = path.join(__dirname, "..", "lib", "board", "participants.js");
  const participantsSource = fs.readFileSync(participantsPath, "utf8");

  assert.ok(source.includes("Совет директоров"));
  assert.ok(source.includes("жёстко и по делу"));
  assert.ok(source.includes("Совещания"));
  assert.ok(source.includes("Новый тред"));
  assert.ok(source.includes("Участники"));
  assert.ok(source.includes("Отправить"));
  assert.ok(source.includes("печатает..."));
  assert.ok(source.includes("Прикрепить файл"));
  assert.ok(source.includes("Добавлять прикреплённые файлы в базу знаний"));
  assert.ok(source.includes("buildParticipantCards"));

  assert.ok(source.includes('fetch("/api/board/threads"'));
  assert.ok(source.includes("fetch(`/api/board/thread/${threadId}`"));
  assert.ok(source.includes('fetch("/api/board/message"'));
  assert.ok(source.includes('formData.append("save_to_knowledge"'));
  assert.ok(source.includes("scrollToRoleMessage"));
  assert.ok(source.includes("board-message-"));

  assert.ok(participantsSource.includes("Антон — CEO (Growth)"));
  assert.ok(participantsSource.includes("Юрий — CTO (Tech)"));
  assert.ok(participantsSource.includes("София — CFO (Risk)"));
  assert.ok(participantsSource.includes("Илья — Chairman (Итог)"));
  assert.ok(participantsSource.includes('"Нет данных"'));
  assert.ok(participantsSource.includes('"В процессе"'));
});
