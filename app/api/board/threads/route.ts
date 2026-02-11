import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { listBoardThreads } from "@/lib/board/chatStore.js";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const threads = await listBoardThreads({ workspaceId: userId });
    return NextResponse.json({ threads });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to list threads";
    return NextResponse.json({ error: message }, { status });
  }
}
