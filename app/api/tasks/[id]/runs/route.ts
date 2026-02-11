import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { filterByRunIndex, getRunIndexFromMeta, summarizeRun } from "@/lib/tasks/runs";

export async function GET(
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

  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      steps: { orderBy: [{ order: "asc" }, { attempt: "asc" }] },
      messages: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runIndexes = Array.from(
    new Set(task.steps.map((step) => getRunIndexFromMeta(step.meta)))
  ).sort((a, b) => b - a);

  const runs = runIndexes.map((runIndex) => {
    const steps = filterByRunIndex(task.steps, runIndex);
    const messages = filterByRunIndex(task.messages, runIndex);
    return summarizeRun(runIndex, steps, messages);
  });

  return NextResponse.json({ runs });
}
