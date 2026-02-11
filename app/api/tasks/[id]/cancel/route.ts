import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

export async function POST(
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
    where: { id: taskId, userId }
  });

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: "cancelled",
      finishedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true });
}
