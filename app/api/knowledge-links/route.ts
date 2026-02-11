import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

const serializeItem = (item: any, linkId?: string) => ({
  link_id: linkId,
  id: item.id,
  title: item.title,
  type: item.sourceType,
  source_url: item.sourceUrl ?? null,
  content: item.contentText,
  updatedAt: item.updatedAt,
  createdAt: item.createdAt
});

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent_id");
  if (!agentId) {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }

  const links = await prisma.knowledgeLink.findMany({
    where: { workspaceId: userId, agentId, scope: "agent" },
    include: { knowledge: true },
    orderBy: { updatedAt: "desc" }
  });

  const items = links.map((link) => serializeItem(link.knowledge, link.id));
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const knowledgeId = body.knowledge_id ? String(body.knowledge_id) : null;
  const agentId = body.agent_id ? String(body.agent_id) : null;

  if (!knowledgeId || !agentId) {
    return NextResponse.json({ error: "knowledge_id and agent_id required" }, { status: 400 });
  }

  const existing = await prisma.knowledgeItem.findFirst({
    where: { id: knowledgeId, workspaceId: userId }
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const link = await prisma.knowledgeLink.create({
    data: {
      workspaceId: userId,
      agentId,
      knowledgeId,
      scope: "agent"
    }
  });

  return NextResponse.json({ link });
}
