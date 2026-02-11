import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const toolSlug = searchParams.get("toolSlug");
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) ? Math.min(rawLimit, 100) : 20;

  const where = toolSlug ? { userId, toolSlug } : { userId };
  const runs = await prisma.toolRun.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit
  });

  return NextResponse.json({ runs });
}
