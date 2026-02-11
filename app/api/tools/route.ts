import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { ensureDefaultTools } from "@/lib/tools/seed";
import { ensureUniqueSlug, slugify } from "@/lib/tools/slug";

const parseJsonSafe = (value: any) => {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultTools(userId);

  const tools = await prisma.tool.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });

  const runs = await prisma.toolRun.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 200
  });

  const lastRunBySlug = new Map<string, typeof runs[number]>();
  runs.forEach((run) => {
    if (!lastRunBySlug.has(run.toolSlug)) {
      lastRunBySlug.set(run.toolSlug, run);
    }
  });

  const payload = tools.map((tool) => {
    const lastRun = lastRunBySlug.get(tool.slug);
    return {
      id: tool.id,
      name: tool.name,
      slug: tool.slug,
      description: tool.description,
      category: tool.category,
      provider: tool.provider,
      type: tool.type,
      isActive: tool.isActive,
      inputSchemaJson: tool.inputSchemaJson,
      outputSchemaJson: tool.outputSchemaJson,
      configJson: tool.configJson,
      updatedAt: tool.updatedAt,
      lastRunAt: lastRun ? lastRun.startedAt : null,
      lastRunStatus: lastRun ? lastRun.status : null
    };
  });

  return NextResponse.json({ tools: payload });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "Новый инструмент");
  const description = String(body.description ?? "Черновик инструмента");
  const safeSlug =
    slugify(name || "tool");
  const baseCategory = String(body.category ?? "draft");
  const category = ["default", "integration", "draft"].includes(baseCategory) ? baseCategory : "draft";
  const rawType = String(body.type ?? "internal");
  const allowedTypes = new Set([
    "system",
    "osm",
    "http_request",
    "json_transform",
    "text_template",
    "web_scraper",
    "internal"
  ]);
  const type = allowedTypes.has(rawType) ? rawType : "internal";
  const rawProvider = String(body.provider ?? (type === "http_request" ? "http" : "internal"));
  const provider = ["internal", "osm", "http"].includes(rawProvider) ? rawProvider : "internal";
  const isActive = typeof body.isActive === "boolean" ? body.isActive : category !== "draft";
  const folderId = body.folderId ? String(body.folderId) : undefined;
  const inputSchema = parseJsonSafe(body.inputSchemaJson || "") || { type: "object", properties: {} };
  const outputSchema = parseJsonSafe(body.outputSchemaJson || "") || { type: "object", properties: {} };
  const config = parseJsonSafe(body.configJson || "") || {};
  const slug = await ensureUniqueSlug(userId, safeSlug);

  const tool = await prisma.tool.create({
    data: {
      userId,
      name,
      slug,
      description,
      category,
      provider,
      type,
      isActive,
      folderId,
      inputSchemaJson: JSON.stringify(inputSchema),
      outputSchemaJson: JSON.stringify(outputSchema),
      configJson: JSON.stringify(config)
    }
  });

  return NextResponse.json({ tool });
}
