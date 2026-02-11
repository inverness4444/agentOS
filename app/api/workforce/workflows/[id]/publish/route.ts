import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const isAdvancedUser = (user: { role?: string | null; advancedMode?: boolean | null }) => {
  const role = (user.role || "").toUpperCase();
  return role === "ADMIN" || Boolean(user.advancedMode);
};

export async function POST(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, advancedMode: true }
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdvancedUser(user)) {
    return NextResponse.json({ error: "Advanced mode required" }, { status: 403 });
  }

  const { id } = await context.params;
  const workflowId = String(id || "").trim();
  if (!workflowId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const workflow = await prisma.workforceWorkflow.findFirst({
    where: { id: workflowId, userId: user.id }
  });
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.workforceWorkflow.update({
    where: { id: workflow.id },
    data: { status: "published" }
  });

  return NextResponse.json({
    workflow: {
      id: updated.id,
      status: updated.status
    }
  });
}
