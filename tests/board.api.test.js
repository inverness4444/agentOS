const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../lib/prisma.js");
const {
  createBoardThread,
  createBoardMessageAndRun,
  listBoardThreads,
  getBoardThread
} = require("../lib/board/chatStore.js");

const createTestUser = async () => {
  const id = `board_api_${randomUUID()}`;
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

test("board api layer lists threads and loads thread messages", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  let userId = "";
  try {
    userId = await createTestUser();

    const created = await createBoardThread({ workspaceId: userId, title: "Стратегический тест" });

    await createBoardMessageAndRun({
      workspaceId: userId,
      threadId: created.id,
      content: "Разберите идею с рынком и рисками"
    });

    const threads = await listBoardThreads({ workspaceId: userId });
    assert.ok(Array.isArray(threads));
    assert.ok(threads.length >= 1, "has at least one thread");

    const targetThread = threads.find((item) => item.id === created.id);
    assert.ok(targetThread, "created thread present in list");
    assert.ok(["Done", "Running", "Error"].includes(targetThread.last_status));

    const loaded = await getBoardThread({ workspaceId: userId, threadId: created.id });
    assert.ok(loaded, "thread payload exists");
    assert.equal(loaded.thread.id, created.id);
    assert.ok(Array.isArray(loaded.messages), "messages list");
    assert.ok(loaded.messages.length >= 5, "user + board replies");
  } finally {
    await cleanupTestUser(userId);
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
