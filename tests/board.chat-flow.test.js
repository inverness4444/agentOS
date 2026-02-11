const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../lib/prisma.js");
const { createBoardMessageAndRun } = require("../lib/board/chatStore.js");

const createTestUser = async () => {
  const id = `board_flow_${randomUUID()}`;
  await prisma.user.create({
    data: {
      id,
      email: `${id}@local.test`,
      passwordHash: "test-hash"
    }
  });
  return id;
};

const cleanupTestUser = async (userId) => {
  if (!userId) return;
  await prisma.user.deleteMany({ where: { id: userId } });
};

test("board chat flow creates 4 board replies after user message", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  let userId = "";
  try {
    userId = await createTestUser();

    const result = await createBoardMessageAndRun({
      workspaceId: userId,
      content: "Нужно запускать новый b2b оффер или подождать?"
    });

    assert.ok(result.thread && result.thread.id, "thread created");
    const threadId = result.thread.id;

    const dbMessages = await prisma.boardMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" }
    });

    assert.ok(dbMessages.length >= 5, "at least 5 messages");
    const roles = dbMessages.map((item) => item.role);
    assert.equal(roles[0], "user", "first message is user");
    assert.deepEqual(roles.slice(1, 5), ["ceo", "cto", "cfo", "chair"]);

    assert.ok(result.messages.some((item) => item.role === "ceo"), "ceo message returned");
    assert.ok(result.messages.some((item) => item.role === "cto"), "cto message returned");
    assert.ok(result.messages.some((item) => item.role === "cfo"), "cfo message returned");
    assert.ok(result.messages.some((item) => item.role === "chair"), "chair message returned");
  } finally {
    await cleanupTestUser(userId);
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
