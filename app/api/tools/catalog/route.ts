import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { getToolsForAgent } from "@/lib/tools/catalog";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tools = await getToolsForAgent(userId);
  return NextResponse.json({ tools });
}
