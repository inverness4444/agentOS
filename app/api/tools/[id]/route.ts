import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

const parseJsonSafe = (value: any) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const toolId = String(id || "").trim();
  if (!toolId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const tool = await prisma.tool.findFirst({
    where: { id: toolId, userId }
  });

  if (!tool) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ tool });
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
  const toolId = String(id || "").trim();
  if (!toolId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const data = {
    name: body.name ? String(body.name) : undefined,
    description: body.description ? String(body.description) : undefined,
    category: body.category ? String(body.category) : undefined,
    provider: body.provider ? String(body.provider) : undefined,
    type: body.type ? String(body.type) : undefined,
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    folderId: body.folderId ? String(body.folderId) : undefined,
    inputSchemaJson: body.inputSchemaJson ? JSON.stringify(parseJsonSafe(body.inputSchemaJson) || body.inputSchemaJson) : undefined,
    outputSchemaJson: body.outputSchemaJson ? JSON.stringify(parseJsonSafe(body.outputSchemaJson) || body.outputSchemaJson) : undefined,
    configJson: body.configJson ? JSON.stringify(parseJsonSafe(body.configJson) || body.configJson) : undefined
  };

  const tool = await prisma.tool.update({
    where: { id: toolId },
    data
  });

  return NextResponse.json({ tool });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return PUT(request, context);
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
  const toolId = String(id || "").trim();
  if (!toolId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const existing = await prisma.tool.findFirst({
    where: { id: toolId, userId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (["osm_geocode", "osm_places_search", "ru_places_search", "web_contact_extractor"].includes(existing.slug)) {
    return NextResponse.json({ error: "System tool cannot be deleted" }, { status: 400 });
  }

  await prisma.tool.delete({ where: { id: toolId } });

  return NextResponse.json({ ok: true });
}
