import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { buildAgentInput, getRunnerDisplayName, runAgentTask } from "@/lib/tasks/runnerMap";
import { getToolsForAgent } from "@/lib/tools/catalog";

const parseJsonSafe = (value?: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const serialize = (value: any) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({});
  }
};

const summarizeOutput = (output: any) => {
  if (!output) return "";
  const payload = output && output.data ? output.data : output;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return text.length > 600 ? `${text.slice(0, 600)}...` : text;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const taskId = String(id || "").trim();
  if (!taskId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const stepId = String(body.stepId || "");
  const runIndex = Number(body.runIndex ?? 0);
  if (!stepId) {
    return NextResponse.json({ error: "stepId required" }, { status: 400 });
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: { steps: true }
  });
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const baseStep = await prisma.taskStep.findFirst({
    where: { id: stepId, taskId: task.id, userId }
  });
  if (!baseStep || !baseStep.agentId) {
    return NextResponse.json({ error: "Step not found or not retryable" }, { status: 400 });
  }

  const existingAttempts = task.steps.filter((step) => {
    if (step.order !== baseStep.order) return false;
    const meta = parseJsonSafe(step.meta);
    if (!meta || meta.runIndex === undefined) return runIndex === 0;
    return meta.runIndex === runIndex;
  });

  const nextAttempt = Math.max(...existingAttempts.map((item) => item.attempt || 1)) + 1;

  const startedAt = new Date();
  await prisma.task.update({
    where: { id: task.id },
    data: { status: "running", startedAt }
  });
  const newStep = await prisma.taskStep.create({
    data: {
      taskId: task.id,
      userId,
      order: baseStep.order,
      attempt: nextAttempt,
      kind: baseStep.kind,
      agentId: baseStep.agentId,
      status: "running",
      startedAt,
      meta: serialize({ runIndex })
    }
  });

  await prisma.taskMessage.create({
    data: {
      taskId: task.id,
      userId,
      role: "system",
      agentId: baseStep.agentId,
      content: `Повтор шага: ${getRunnerDisplayName(baseStep.agentId)}`,
      meta: serialize({ runIndex })
    }
  });

  const tags = parseJsonSafe(task.tags) || {};
  const toolsEnabled = tags.toolsEnabled !== false;
  const knowledgeEnabled = tags.knowledgeEnabled !== false;
  const toolsCatalog = toolsEnabled ? await getToolsForAgent(userId) : [];
  const inputPayload = baseStep.inputJson
    ? parseJsonSafe(baseStep.inputJson) || buildAgentInput(baseStep.agentId, task.inputText, toolsEnabled)
    : buildAgentInput(baseStep.agentId, task.inputText, toolsEnabled);
  if (toolsCatalog.length) {
    (inputPayload as any).tools_catalog = toolsCatalog;
  }

  try {
    const output = await runAgentTask({
      key: baseStep.agentId,
      input: inputPayload,
      toolsEnabled,
      knowledgeEnabled,
      workspaceId: userId
    });

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await prisma.taskStep.update({
      where: { id: newStep.id },
      data: {
        status: "success",
        finishedAt,
        durationMs,
        inputJson: serialize(inputPayload),
        outputJson: serialize(output)
      }
    });

    const snippet = summarizeOutput(output);
    await prisma.taskMessage.create({
      data: {
        taskId: task.id,
        userId,
        role: "agent",
        agentId: baseStep.agentId,
        content: snippet || "Готово.",
        meta: serialize({ runIndex })
      }
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "success",
        errorText: null,
        outputSummary: snippet,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime()
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const message = error instanceof Error ? error.message : "Retry failed";

    await prisma.taskStep.update({
      where: { id: newStep.id },
      data: {
        status: "error",
        finishedAt,
        durationMs,
        errorText: message
      }
    });

    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: "error",
        errorText: message,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime()
      }
    });

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
