const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../lib/prisma.js");
const {
  createBoardThread,
  createBoardMessageAndRun,
  getBoardThread
} = require("../lib/board/chatStore.js");

const createTestUser = async () => {
  const id = `board_user_${randomUUID()}`;
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

test("board storage creates thread, user message and attachment records", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  let userId = "";
  try {
    userId = await createTestUser();

    const thread = await createBoardThread({
      workspaceId: userId,
      title: "Проверка вложений"
    });

    const boardAgents = await prisma.agent.findMany({
      where: {
        userId,
        config: { contains: '"internalKey":"board-agent:' }
      }
    });
    assert.equal(boardAgents.length, 4, "board agents are synced into Agent table");

    const run = await createBoardMessageAndRun({
      workspaceId: userId,
      threadId: thread.id,
      content: "Проверьте идею с учетом файла",
      saveToKnowledge: true,
      files: [
        {
          filename: "brief.txt",
          mime: "text/plain",
          size: 34,
          buffer: Buffer.from("Контракт и вводные условия пилота")
        }
      ]
    });

    assert.equal(run.thread.id, thread.id);

    const loaded = await getBoardThread({ workspaceId: userId, threadId: thread.id });
    assert.ok(loaded, "thread should load");

    const userMessage = loaded.messages.find((item) => item.role === "user");
    assert.ok(userMessage, "user message exists");
    assert.ok(Array.isArray(userMessage.attachments), "attachments array exists");
    assert.equal(userMessage.attachments.length, 1, "one attachment chip");

    const attachments = await prisma.boardAttachment.findMany({ where: { threadId: thread.id } });
    assert.equal(attachments.length, 1, "one attachment row in db");
    assert.equal(attachments[0].filename, "brief.txt");
    assert.equal(typeof attachments[0].storagePath, "string");
    assert.ok(attachments[0].storagePath.includes("uploads/board/"));
    assert.ok(String(attachments[0].extractedText || "").includes("Контракт"));

    const knowledgeItems = await prisma.knowledgeItem.findMany({
      where: { workspaceId: userId }
    });
    assert.ok(knowledgeItems.length >= 1, "attachment is ingested into knowledge");

    const workspaceLinks = await prisma.knowledgeLink.findMany({
      where: { workspaceId: userId, scope: "workspace", agentId: null }
    });
    assert.ok(workspaceLinks.length >= 1, "workspace knowledge link created");
  } finally {
    await cleanupTestUser(userId);
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
