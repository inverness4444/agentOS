import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { selectAgentsAuto } from "@/lib/tasks/router";

const parseTags = (value?: string | null) => {
  if (!value) return {} as any;
  try {
    return JSON.parse(value);
  } catch {
    return {} as any;
  }
};

const buildTitle = (inputText: string) => {
  const words = String(inputText || "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 10).join(" ") || "Новая задача";
};

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tasks = await prisma.task.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { steps: true }
  });

  const payload = tasks.map((task) => {
    const tags = parseTags(task.tags);
    const runIndex = typeof tags.runIndex === "number" ? tags.runIndex : 0;
    const steps = (task.steps || []).filter((step) => {
      if (!step.meta) return runIndex === 0;
      try {
        const meta = JSON.parse(step.meta);
        if (meta?.runIndex === undefined) return runIndex === 0;
        return meta.runIndex === runIndex;
      } catch {
        return runIndex === 0;
      }
    });
    const agents = Array.from(
      new Set(steps.filter((step) => step.agentId).map((step) => step.agentId as string))
    );
    return {
      id: task.id,
      title: task.title || buildTitle(task.inputText),
      inputText: task.inputText,
      status: task.status,
      mode: task.mode,
      selectedAgentId: task.selectedAgentId,
      updatedAt: task.updatedAt,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      durationMs: task.durationMs,
      outputSummary: task.outputSummary,
      agents
    };
  });

  return NextResponse.json({ tasks: payload });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const inputText = String(body.inputText || "").trim();
  if (!inputText) {
    return NextResponse.json({ error: "inputText required" }, { status: 400 });
  }

  const mode = String(body.mode || "auto");
  const selectedAgentId = body.selectedAgentId ? String(body.selectedAgentId) : null;
  const selectedAgentIds = Array.isArray(body.selectedAgentIds)
    ? body.selectedAgentIds.map((id: string) => String(id))
    : [];
  const toolsEnabled = body.toolsEnabled !== false;
  const knowledgeEnabled = body.knowledgeEnabled !== false;

  const tags = {
    toolsEnabled,
    knowledgeEnabled,
    selectedAgentIds: mode === "team" ? selectedAgentIds : [],
    runIndex: 0,
    autoAgents: mode === "auto" ? selectAgentsAuto(inputText) : []
  };

  const task = await prisma.task.create({
    data: {
      userId,
      title: body.title ? String(body.title) : null,
      inputText,
      mode,
      selectedAgentId,
      status: "draft",
      tags: JSON.stringify(tags),
      messages: {
        create: [{
          userId,
          role: "user",
          content: inputText,
          meta: JSON.stringify({ runIndex: 0 })
        }]
      }
    }
  });

  return NextResponse.json({ task });
}
