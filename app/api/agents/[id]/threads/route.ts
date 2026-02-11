import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { listAgentThreads, createAgentThread } from "@/lib/agents/chatStore.js";

export const runtime = "nodejs";

const getAgentId = async (context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  return String(id || "").trim();
};

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = await getAgentId(context);
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }

  try {
    const threads = await listAgentThreads({ workspaceId: userId, agentId });
    return NextResponse.json({ threads });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to list threads";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agentId = await getAgentId(context);
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "";

  try {
    const thread = await createAgentThread({
      workspaceId: userId,
      agentId,
      title
    });
    return NextResponse.json({ thread });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to create thread";
    return NextResponse.json({ error: message }, { status });
  }
}
