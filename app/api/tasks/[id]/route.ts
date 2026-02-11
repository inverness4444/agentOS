import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { buildRunOutputSummary, filterByRunIndex, resolveLatestRunIndex, summarizeRun } from "@/lib/tasks/runs";

export async function GET(
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

  const { searchParams } = new URL(request.url);
  const rawRunIndex = searchParams.get("runIndex");
  let requestedRunIndex: number | null = null;
  if (rawRunIndex !== null) {
    const parsed = Number(rawRunIndex);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return NextResponse.json({ error: "Invalid runIndex" }, { status: 400 });
    }
    requestedRunIndex = parsed;
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      steps: { orderBy: { order: "asc" } },
      messages: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const latestRunIndex = resolveLatestRunIndex(task.tags, task.steps, task.messages);
  const selectedRunIndex = requestedRunIndex ?? latestRunIndex;

  const steps = filterByRunIndex(task.steps, selectedRunIndex);
  const messages = filterByRunIndex(task.messages, selectedRunIndex);

  const runSummary = summarizeRun(selectedRunIndex, steps, messages);
  const runErrorText = steps.find((step) => step.status === "error")?.errorText ?? null;
  const derivedOutputSummary = buildRunOutputSummary(steps, messages);
  const selectedStatus =
    steps.length === 0 && selectedRunIndex === latestRunIndex ? task.status : runSummary.status;
  const selectedStartedAt =
    runSummary.startedAt ?? (selectedRunIndex === latestRunIndex ? task.startedAt : null);
  const selectedFinishedAt =
    runSummary.finishedAt ?? (selectedRunIndex === latestRunIndex ? task.finishedAt : null);
  const selectedDurationMs =
    runSummary.durationMs ?? (selectedRunIndex === latestRunIndex ? task.durationMs : null);
  const selectedErrorText =
    selectedRunIndex === latestRunIndex ? task.errorText ?? runErrorText : runErrorText;
  const selectedOutputSummary =
    selectedRunIndex === latestRunIndex
      ? task.outputSummary || derivedOutputSummary
      : derivedOutputSummary;

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      inputText: task.inputText,
      status: selectedStatus,
      mode: task.mode,
      selectedAgentId: task.selectedAgentId,
      updatedAt: task.updatedAt,
      createdAt: task.createdAt,
      startedAt: selectedStartedAt,
      finishedAt: selectedFinishedAt,
      durationMs: selectedDurationMs,
      errorText: selectedErrorText,
      outputSummary: selectedOutputSummary,
      tags: task.tags,
      currentRunIndex: latestRunIndex,
      selectedRunIndex
    },
    run: runSummary,
    steps,
    messages
  });
}

export async function PATCH(
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

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: body.title ? String(body.title) : undefined
    }
  });

  return NextResponse.json({ task });
}

export async function DELETE(
  _: Request,
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

  const existing = await prisma.task.findFirst({
    where: { id: taskId, userId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: taskId } });

  return NextResponse.json({ ok: true });
}
