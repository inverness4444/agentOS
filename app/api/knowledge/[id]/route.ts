import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { buildSearchText, estimateTokens, hashContent } from "@/utils/knowledge";

const serializeItem = (item: any) => ({
  id: item.id,
  title: item.title,
  type: item.sourceType,
  source_url: item.sourceUrl ?? null,
  content: item.contentText,
  updatedAt: item.updatedAt,
  createdAt: item.createdAt
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const itemId = String(id || "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const item = await prisma.knowledgeItem.findFirst({
    where: { id: itemId, workspaceId: userId }
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item: serializeItem(item) });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const itemId = String(id || "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const existing = await prisma.knowledgeItem.findFirst({
    where: { id: itemId, workspaceId: userId }
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextTitle = body.title ? String(body.title) : existing.title;
  const nextContent =
    typeof body.content === "string" ? String(body.content) : existing.contentText;
  const nextType = body.type ? String(body.type) : existing.sourceType;
  const nextSourceUrl =
    typeof body.source_url === "string" ? body.source_url : existing.sourceUrl;

  const searchText = buildSearchText(nextTitle, nextContent);
  const contentHash = hashContent(nextContent);
  const tokensCountEstimate = estimateTokens(searchText);

  const item = await prisma.knowledgeItem.update({
    where: { id: itemId },
    data: {
      title: nextTitle,
      sourceType: nextType,
      sourceUrl: nextSourceUrl,
      contentText: nextContent,
      contentHash,
      tokensCountEstimate,
      searchText
    }
  });

  return NextResponse.json({ item: serializeItem(item) });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const itemId = String(id || "").trim();
  if (!itemId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.knowledgeItem.findFirst({
    where: { id: itemId, workspaceId: userId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.knowledgeLink.deleteMany({
    where: { knowledgeId: itemId, workspaceId: userId }
  });
  await prisma.knowledgeItem.delete({ where: { id: itemId } });

  return NextResponse.json({ ok: true });
}
