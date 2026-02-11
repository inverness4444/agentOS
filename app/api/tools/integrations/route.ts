import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import { ensureDefaultTools } from "@/lib/tools/seed";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureDefaultTools(userId);

  const integrations = await prisma.integration.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json({ integrations });
}
