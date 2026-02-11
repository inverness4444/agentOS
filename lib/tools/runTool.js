const { prisma } = require("../prisma.js");
const { executeTool } = require("./executor");
const { validateInput } = require("./validate");
const { ensureDefaultTools } = require("./seed");
const { checkRateLimit } = require("./rateLimit");

const parseSchema = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const runTool = async ({ userId, toolSlug, input, skipRateLimit = false }) => {
  if (!userId) {
    return { ok: false, status: "error", error: "Unauthorized" };
  }
  if (!toolSlug) {
    return { ok: false, status: "error", error: "toolSlug required" };
  }

  if (!skipRateLimit) {
    const rate = checkRateLimit(userId);
    if (!rate.allowed) {
      return { ok: false, status: "error", error: "Rate limit exceeded" };
    }
  }

  await ensureDefaultTools(userId);

  const tool = await prisma.tool.findFirst({ where: { userId, slug: toolSlug } });
  if (!tool) {
    return { ok: false, status: "error", error: "Tool not found" };
  }

  if (!tool.isActive) {
    const startedAt = new Date();
    const run = await prisma.toolRun.create({
      data: {
        userId,
        toolId: tool.id,
        toolSlug,
        status: "error",
        inputJson: JSON.stringify(input ?? {}),
        outputJson: null,
        errorText: "Tool is inactive",
        startedAt,
        finishedAt: new Date(),
        durationMs: 0
      }
    });
    return { ok: false, status: "error", error: "Tool is inactive", runId: run.id };
  }

  if (tool.provider !== "internal" && tool.provider !== "http") {
    const integration = await prisma.integration.findFirst({
      where: { userId, provider: tool.provider }
    });
    if (!integration || integration.status !== "enabled") {
      const startedAt = new Date();
      const run = await prisma.toolRun.create({
        data: {
          userId,
          toolId: tool.id,
          toolSlug,
          status: "error",
          inputJson: JSON.stringify(input ?? {}),
          outputJson: null,
          errorText: "Integration not available",
          startedAt,
          finishedAt: new Date(),
          durationMs: 0
        }
      });
      return { ok: false, status: "error", error: "Integration not available", runId: run.id };
    }
  }

  const inputSchema = parseSchema(tool.inputSchemaJson || "") || { type: "object" };
  const validation = validateInput(inputSchema, input);
  if (!validation.ok) {
    const startedAt = new Date();
    const run = await prisma.toolRun.create({
      data: {
        userId,
        toolId: tool.id,
        toolSlug,
        status: "error",
        inputJson: JSON.stringify(input ?? {}),
        outputJson: null,
        errorText: validation.errors?.join(", ") || "Invalid input",
        startedAt,
        finishedAt: new Date(),
        durationMs: 0
      }
    });
    return {
      ok: false,
      status: "error",
      error: validation.errors?.join(", ") || "Invalid input",
      runId: run.id
    };
  }

  const startedAt = new Date();
  let output = null;
  let errorText = null;
  let status = "success";

  try {
    output = await executeTool({ tool, input: validation.value });
  } catch (error) {
    status = "error";
    errorText = error instanceof Error ? error.message : "Unknown error";
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  const run = await prisma.toolRun.create({
    data: {
      userId,
      toolId: tool.id,
      toolSlug,
      status,
      inputJson: JSON.stringify(validation.value ?? {}),
      outputJson: output ? JSON.stringify(output) : null,
      errorText,
      startedAt,
      finishedAt,
      durationMs
    }
  });

  if (status === "error") {
    return { ok: false, status: "error", error: errorText, runId: run.id };
  }

  return { ok: true, status: "success", output, runId: run.id, tool };
};

module.exports = { runTool };
