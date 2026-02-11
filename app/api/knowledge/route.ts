import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { buildSearchText, estimateTokens, hashContent } from "@/utils/knowledge";

const serializeItem = (item: any, link?: any) => ({
  link_id: link?.id ?? null,
  id: item.id,
  title: item.title,
  type: item.sourceType,
  source_url: item.sourceUrl ?? null,
  content: item.contentText,
  scope: link?.scope ?? "workspace",
  agent_id: link?.agentId ?? null,
  updatedAt: item.updatedAt,
  createdAt: item.createdAt
});

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const links = await prisma.knowledgeLink.findMany({
    where: { workspaceId: userId, scope: { in: ["workspace", "agent"] } },
    include: { knowledge: true },
    orderBy: { updatedAt: "desc" }
  });

  const items = links.map((link) => serializeItem(link.knowledge, link));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "Новые знания");
  const type = String(body.type ?? "note");
  const content = String(body.content ?? "");
  const scope = body.scope === "agent" ? "agent" : "workspace";
  const agentId =
    scope === "agent" && body.agent_id ? String(body.agent_id) : null;
  if (scope === "agent" && !agentId) {
    return NextResponse.json({ error: "agent_id required" }, { status: 400 });
  }
  if (scope === "agent" && agentId) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, userId }
    });
    if (!agent) {
      return NextResponse.json(
        { error: "agent not found for workspace" },
        { status: 400 }
      );
    }
  }

  const sourceUrl =
    typeof body.source_url === "string" && body.source_url.trim()
      ? body.source_url.trim()
      : body.meta && typeof body.meta.url === "string"
        ? String(body.meta.url)
        : body.meta && typeof body.meta.fileName === "string"
          ? String(body.meta.fileName)
          : body.meta && typeof body.meta.toolId === "string"
            ? `tool:${body.meta.toolId}`
            : null;

  const searchText = buildSearchText(title, content);
  const contentHash = hashContent(content);
  const tokensCountEstimate = estimateTokens(searchText);

  const item = await prisma.knowledgeItem.create({
    data: {
      workspaceId: userId,
      title,
      sourceType: type,
      sourceUrl,
      contentText: content,
      contentHash,
      tokensCountEstimate,
      searchText
    }
  });

  const link = await prisma.knowledgeLink.create({
    data: {
      workspaceId: userId,
      agentId,
      knowledgeId: item.id,
      scope
    }
  });

  return NextResponse.json({ item: serializeItem(item, link), link });
}
