import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { rerunBoardThread } from "@/lib/board/chatStore.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const threadId = String(body.thread_id || body.threadId || "").trim();
  if (!threadId) {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  try {
    const result = await rerunBoardThread({
      workspaceId: userId,
      threadId,
      goal: body.goal ? String(body.goal) : undefined,
      constraints: body.constraints ? String(body.constraints) : undefined,
      context: body.context ? String(body.context) : undefined
    });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to run board";
    return NextResponse.json({ error: message }, { status });
  }
}
