import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const linkId = String(id || "").trim();
  if (!linkId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.knowledgeLink.findFirst({
    where: { id: linkId, workspaceId: userId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.knowledgeLink.delete({ where: { id: linkId } });

  return NextResponse.json({ ok: true });
}
