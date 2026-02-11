const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../lib/prisma.js");
const {
  ensureBoardAgentsForWorkspace,
  isHiddenBoardAgentRecord,
  readInternalKeyFromConfig
} = require("../lib/board/agentSync.js");

const createTestUser = async () => {
  const id = `board_sync_${randomUUID()}`;
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

test("board agent sync writes 4 internal board agents to Agent table", async () => {
  let userId = "";
  try {
    userId = await createTestUser();

    const first = await ensureBoardAgentsForWorkspace({ workspaceId: userId });
    assert.equal(first.created, 4, "first sync creates 4 board agents");

    const second = await ensureBoardAgentsForWorkspace({ workspaceId: userId });
    assert.equal(second.created, 0, "second sync is idempotent");

    const boardAgents = await prisma.agent.findMany({
      where: {
        userId,
        config: { contains: '"internalKey":"board-agent:' }
      },
      orderBy: { name: "asc" }
    });

    assert.equal(boardAgents.length, 4, "db contains exactly 4 board agents");
    boardAgents.forEach((item) => {
      assert.equal(isHiddenBoardAgentRecord(item), true, `hidden board marker for ${item.name}`);
      const internalKey = readInternalKeyFromConfig(item.config);
      assert.ok(internalKey.startsWith("board-agent:"), `internalKey for ${item.name}`);
    });
  } finally {
    await cleanupTestUser(userId);
  }
});

