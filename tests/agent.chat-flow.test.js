const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { prisma } = require("../lib/prisma.js");
const {
  createAgentMessageAndRun,
  listAgentThreads,
  getAgentThread
} = require("../lib/agents/chatStore.js");

const createTestUser = async () => {
  const id = `agent_chat_${randomUUID()}`;
  await prisma.user.create({
    data: {
      id,
      email: `${id}@local.test`,
      passwordHash: "test-hash"
    }
  });
  return id;
};

const createTestAgent = async (userId) => {
  return prisma.agent.create({
    data: {
      userId,
      name: "Анастасия — Архитектор процессов и схем",
      description: "Тестовый агент чата",
      systemPrompt: "test",
      outputSchema: "{}",
      toolIds: "[]",
      config: "{}",
      published: false
    }
  });
};

const cleanupTestUser = async (userId) => {
  if (!userId) return;
  await prisma.user.deleteMany({ where: { id: userId } });
};

test("agent chat flow creates thread and assistant reply", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  let userId = "";
  try {
    userId = await createTestUser();
    const agent = await createTestAgent(userId);

    const result = await createAgentMessageAndRun({
      workspaceId: userId,
      agentId: agent.id,
      content: "Построй схему запуска AgentOS за 7 дней"
    });

    assert.ok(result.thread && result.thread.id, "thread created");
    assert.ok(Array.isArray(result.messages), "messages returned");
    assert.ok(result.messages.length >= 2, "has user and assistant messages");
    assert.equal(result.messages[0].role, "user");
    assert.equal(result.messages[result.messages.length - 1].role, "assistant");

    const threads = await listAgentThreads({ workspaceId: userId, agentId: agent.id });
    assert.ok(threads.length >= 1, "thread appears in history");
    assert.ok(["Done", "Running", "Error"].includes(threads[0].last_status), "thread status mapped");

    const loaded = await getAgentThread({
      workspaceId: userId,
      agentId: agent.id,
      threadId: result.thread.id
    });
    assert.ok(loaded, "thread can be loaded");
    assert.ok(Array.isArray(loaded.messages));
    assert.ok(loaded.messages.some((item) => item.role === "assistant"), "assistant message saved");
  } finally {
    await cleanupTestUser(userId);
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
