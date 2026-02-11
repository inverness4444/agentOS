import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { selectAgentsAuto } from "@/lib/tasks/router";
import { buildAgentInput, getRunnerDisplayName, runAgentTask } from "@/lib/tasks/runnerMap";
import { getToolsForAgent } from "@/lib/tools/catalog";

const parseTags = (value?: string | null) => {
  if (!value) return {} as any;
  try {
    return JSON.parse(value);
  } catch {
    return {} as any;
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

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId }
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (task.status === "running") {
    return NextResponse.json({ error: "Task already running" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const tags = parseTags(task.tags);
  const toolsEnabled = body.toolsEnabled !== undefined ? Boolean(body.toolsEnabled) : tags.toolsEnabled !== false;
  const knowledgeEnabled = body.knowledgeEnabled !== undefined ? Boolean(body.knowledgeEnabled) : tags.knowledgeEnabled !== false;

  let agentKeys: string[] = [];
  if (task.mode === "single_agent") {
    agentKeys = task.selectedAgentId ? [task.selectedAgentId] : [];
  } else if (task.mode === "team") {
    agentKeys = Array.isArray(tags.selectedAgentIds) ? tags.selectedAgentIds : [];
  } else {
    agentKeys = selectAgentsAuto(task.inputText);
  }

  if (agentKeys.length === 0) {
    return NextResponse.json({ error: "No agents selected" }, { status: 400 });
  }

  const runIndex = typeof tags.runIndex === "number" ? tags.runIndex + 1 : 1;
  const updatedTags = { ...tags, toolsEnabled, knowledgeEnabled, runIndex };

  const startedAt = new Date();
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "running",
      startedAt,
      finishedAt: null,
      errorText: null,
      outputSummary: null,
      tags: JSON.stringify(updatedTags)
    }
  });

  await prisma.taskMessage.create({
    data: {
      taskId: task.id,
      userId,
      role: "system",
      content: "Запуск задачи",
      meta: JSON.stringify({ runIndex })
    }
  });

  const steps = await prisma.$transaction(
    agentKeys.map((agentKey, index) =>
      prisma.taskStep.create({
        data: {
          taskId: task.id,
          userId,
          order: index + 1,
          attempt: 1,
          kind: "agent",
          agentId: agentKey,
          status: "queued",
          meta: JSON.stringify({ runIndex })
        }
      })
    )
  );

  let outputSummary = "";
  let status: "success" | "error" = "success";
  let errorText: string | null = null;

  const toolsCatalog = toolsEnabled ? await getToolsForAgent(userId) : [];

  for (const step of steps) {
    const stepStart = new Date();
    await prisma.taskStep.update({
      where: { id: step.id },
      data: { status: "running", startedAt: stepStart }
    });

    const agentName = getRunnerDisplayName(step.agentId || "");

    await prisma.taskMessage.create({
      data: {
        taskId: task.id,
        userId,
        role: "system",
        agentId: step.agentId,
        content: `Запуск агента ${agentName}`,
        meta: JSON.stringify({ runIndex })
      }
    });

    try {
      const inputPayload = buildAgentInput(step.agentId || "", task.inputText, toolsEnabled);
      if (toolsCatalog.length) {
        (inputPayload as any).tools_catalog = toolsCatalog;
      }
      const output = await runAgentTask({
        key: step.agentId || "",
        input: inputPayload,
        toolsEnabled,
        knowledgeEnabled,
        workspaceId: userId
      });

      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - stepStart.getTime();

      await prisma.taskStep.update({
        where: { id: step.id },
        data: {
          status: "success",
          finishedAt,
          durationMs,
          inputJson: serialize(inputPayload),
          outputJson: serialize(output)
        }
      });

      const snippet = summarizeOutput(output);
      outputSummary += `${agentName}: ${snippet}\n\n`;

      await prisma.taskMessage.create({
        data: {
          taskId: task.id,
          userId,
          role: "agent",
          agentId: step.agentId,
          content: snippet || "Готово.",
          meta: JSON.stringify({ runIndex })
        }
      });
    } catch (error) {
      status = "error";
      errorText = error instanceof Error ? error.message : "Ошибка выполнения";
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - stepStart.getTime();

      await prisma.taskStep.update({
        where: { id: step.id },
        data: {
          status: "error",
          finishedAt,
          durationMs,
          errorText
        }
      });

      await prisma.taskMessage.create({
        data: {
          taskId: task.id,
          userId,
          role: "system",
          agentId: step.agentId,
          content: `Ошибка шага: ${errorText}`,
          meta: JSON.stringify({ runIndex })
        }
      });
      break;
    }
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status,
      finishedAt,
      durationMs,
      errorText,
      outputSummary: outputSummary.trim()
    }
  });

  return NextResponse.json({
    ok: status === "success",
    status,
    error: errorText,
    runIndex
  });
}
