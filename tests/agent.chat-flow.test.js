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
      name: "Мария — Разбор компании",
      description: "Тестовый агент чата",
      systemPrompt: "test",
      outputSchema: "{}",
      toolIds: "[]",
      config: "{}",
      published: false
    }
  });
};

const createNamedAgent = async (userId, name) =>
  prisma.agent.create({
    data: {
      userId,
      name,
      description: "Тестовый агент чата",
      systemPrompt: "test",
      outputSchema: "{}",
      toolIds: "[]",
      config: "{}",
      published: false
    }
  });

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
      content:
        "Проанализируй сайт https://QuadrantStress.ru и построй схему запуска AgentOS за 7 дней"
    });

    assert.ok(result.thread && result.thread.id, "thread created");
    assert.ok(Array.isArray(result.messages), "messages returned");
    assert.ok(result.messages.length >= 2, "has user and assistant messages");
    assert.equal(result.messages[0].role, "user");
    assert.equal(result.messages[result.messages.length - 1].role, "assistant");
    const assistantMessage = result.messages[result.messages.length - 1];
    assert.ok(
      !/Краткое резюме|Основная часть|OUTPUT:/i.test(assistantMessage.content),
      "assistant response must be plain chat format"
    );
    assert.match(assistantMessage.content, /quadrantstress\.ru/i, "target URL context is preserved");
    assert.ok(assistantMessage.content.length > 120, "assistant response should be non-trivial");
    assert.ok(!assistantMessage.content.includes("ещё полей"), "no hidden fields marker");
    assert.ok(!assistantMessage.content.includes("...ещё"), "no ellipsis truncation marker");

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

test("out-of-role request on timofey returns handoff draft instead of running wrong task", async () => {
  const prevProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "fake";

  let userId = "";
  try {
    userId = await createTestUser();
    const agent = await createNamedAgent(userId, "Тимофей — Анализ конкурентов");

    const result = await createAgentMessageAndRun({
      workspaceId: userId,
      agentId: agent.id,
      content: "напиши cold email для CEO про инвестиции"
    });

    const assistantMessage = result.messages[result.messages.length - 1];
    assert.equal(assistantMessage.role, "assistant");
    assert.ok(
      /Это не моя роль|Переключил задачу на/i.test(assistantMessage.content),
      "must clearly signal role mismatch or handoff"
    );
    assert.equal(/email sequences:/i.test(assistantMessage.content), false, "must not leak yaml skeleton");
  } finally {
    await cleanupTestUser(userId);
    if (prevProvider === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = prevProvider;
  }
});
