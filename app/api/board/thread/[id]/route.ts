import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { getBoardThread } from "@/lib/board/chatStore.js";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const threadId = String(id || "").trim();
  if (!threadId) {
    return NextResponse.json({ error: "thread id required" }, { status: 400 });
  }

  try {
    const payload = await getBoardThread({ workspaceId: userId, threadId });
    if (!payload) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to load thread";
    return NextResponse.json({ error: message }, { status });
  }
}
