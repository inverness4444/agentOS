import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { executeWorkflow } from "@/lib/workforce/runtime";

const isAdvancedUser = (user: { role?: string | null; advancedMode?: boolean | null }) => {
  const role = (user.role || "").toUpperCase();
  return role === "ADMIN" || Boolean(user.advancedMode);
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const workflowId = String(body.workflowId || "");
  const input = body.input || {};

  if (!workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, advancedMode: true }
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflow = await prisma.workforceWorkflow.findFirst({
    where: { id: workflowId, userId: user.id }
  });

  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const advanced = isAdvancedUser(user);
  if (!advanced && workflow.isAdvanced) {
    return NextResponse.json({ error: "Advanced mode required" }, { status: 403 });
  }
  if (!advanced && workflow.status !== "published") {
    return NextResponse.json({ error: "Workflow not published" }, { status: 403 });
  }
  if (!advanced && !workflow.isActive) {
    return NextResponse.json({ error: "Workflow inactive" }, { status: 403 });
  }

  const startedAt = new Date();
  const run = await prisma.workforceRun.create({
    data: {
      userId: user.id,
      workflowId: workflow.id,
      status: "running",
      inputJson: JSON.stringify(input || {}),
      outputJson: null,
      errorText: null,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0
    }
  });

  try {
    const { output, trace } = await executeWorkflow({
      definitionJson: workflow.definitionJson,
      input,
      userId: user.id
    });

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await prisma.workforceRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        outputJson: JSON.stringify(output || {}),
        traceJson: JSON.stringify(trace || []),
        finishedAt,
        durationMs
      }
    });

    await prisma.workforceWorkflow.update({
      where: { id: workflow.id },
      data: { lastRunAt: finishedAt, lastRunStatus: "success" }
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      output,
      trace
    });
  } catch (error) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const message = error instanceof Error ? error.message : "Workflow failed";

    await prisma.workforceRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        errorText: message,
        finishedAt,
        durationMs
      }
    });

    await prisma.workforceWorkflow.update({
      where: { id: workflow.id },
      data: { lastRunAt: finishedAt, lastRunStatus: "error" }
    });

    return NextResponse.json({ ok: false, error: message, runId: run.id }, { status: 500 });
  }
}
