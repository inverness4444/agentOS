import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { createBoardThread } from "@/lib/board/chatStore.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : "";

  try {
    const thread = await createBoardThread({ workspaceId: userId, title });
    return NextResponse.json({ thread });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to create thread";
    return NextResponse.json({ error: message }, { status });
  }
}
