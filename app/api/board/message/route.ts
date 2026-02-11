import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { createBoardMessageAndRun } from "@/lib/board/chatStore.js";

export const runtime = "nodejs";

type ApiFile = { filename: string; mime: string; size: number; buffer: Buffer };

const toBool = (value: unknown) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const parseMultipartBody = async (request: Request) => {
  const form = await request.formData();
  const thread_id = String(form.get("thread_id") || "").trim();
  const content = String(form.get("content") || form.get("message") || "").trim();
  const goal = String(form.get("goal") || "").trim();
  const constraints = String(form.get("constraints") || "").trim();
  const context = String(form.get("context") || "").trim();
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
    goal,
    constraints,
    context,
    save_to_knowledge,
    files
  };
};

const parseJsonBody = async (request: Request) => {
  const body = await request.json().catch(() => ({}));
  return {
    thread_id: String(body.thread_id || body.threadId || "").trim(),
    content: String(body.content || body.message || "").trim(),
    goal: String(body.goal || "").trim(),
    constraints: String(body.constraints || "").trim(),
    context: String(body.context || "").trim(),
    save_to_knowledge: toBool(body.save_to_knowledge),
    files: [] as ApiFile[]
  };
};

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  const payload = contentType.includes("multipart/form-data")
    ? await parseMultipartBody(request)
    : await parseJsonBody(request);

  if (!payload.content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }

  try {
    const result = await createBoardMessageAndRun({
      workspaceId: userId,
      threadId: payload.thread_id || undefined,
      content: payload.content,
      files: payload.files,
      goal: payload.goal || undefined,
      constraints: payload.constraints || undefined,
      context: payload.context || undefined,
      saveToKnowledge: payload.save_to_knowledge
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    const message = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status });
  }
}
