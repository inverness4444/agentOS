import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { getAgentThread } from "@/lib/agents/chatStore.js";

export const runtime = "nodejs";

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string; threadId: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, threadId: rawThreadId } = await context.params;
  const agentId = String(id || "").trim();
  const threadId = String(rawThreadId || "").trim();
  if (!agentId || !threadId) {
    return NextResponse.json({ error: "agent id and thread id required" }, { status: 400 });
  }

  try {
    const payload = await getAgentThread({
      workspaceId: userId,
      agentId,
      threadId
    });
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
