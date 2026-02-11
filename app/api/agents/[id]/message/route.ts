import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { createAgentMessageAndRun } from "@/lib/agents/chatStore.js";

export const runtime = "nodejs";

type ApiFile = { filename: string; mime: string; size: number; buffer: Buffer };

const toBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const parseMultipartBody = async (request: Request) => {
  const form = await request.formData();
  const thread_id = String(form.get("thread_id") || form.get("threadId") || "").trim();
  const content = String(form.get("content") || form.get("message") || "").trim();
  const save_to_knowledge = toBool(form.get("save_to_knowledge"));
  const files: ApiFile[] = [];

  const rawFiles = form.getAll("files");
  for (const item of rawFiles) {
    if (typeof File !== "undefined" && item instanceof File) {
      const buffer = Buffer.from(await item.arrayBuffer());
      files.push({
        filename: item.name,
        mime: item.type,
        size: item.size,
        buffer
      });
    }
  }

  return {
    thread_id,
    content,
    save_to_knowledge,
    files
  };
};

const parseJsonBody = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return {
    thread_id: String(body.thread_id || body.threadId || "").trim(),
    content: String(body.content || body.message || "").trim(),
    save_to_knowledge: toBool(body.save_to_knowledge),
    files: [] as ApiFile[]
  };
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const agentId = String(id || "").trim();
  if (!agentId) {
    return NextResponse.json({ error: "agent id required" }, { status: 400 });
  }

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  const payload = contentType.includes("multipart/form-data")
    ? await parseMultipartBody(request)
    : await parseJsonBody(request);

  const content = payload.content;
  const threadId = payload.thread_id;

  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  try {
    const result = await createAgentMessageAndRun({
      workspaceId: userId,
      agentId,
      threadId: threadId || undefined,
      content,
      files: payload.files,
      saveToKnowledge: payload.save_to_knowledge
    });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status });
  }
}
