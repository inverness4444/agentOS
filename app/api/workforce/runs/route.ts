import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workflowId = searchParams.get("workflowId");
  if (!workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }

  const runs = await prisma.workforceRun.findMany({
    where: { userId: session.user.id, workflowId },
    orderBy: { startedAt: "desc" },
    take: 20
  });

  return NextResponse.json({
    runs: runs.map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs,
      inputJson: run.inputJson,
      outputJson: run.outputJson,
      errorText: run.errorText
    }))
  });
}
