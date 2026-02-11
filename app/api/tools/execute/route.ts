import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { runTool } from "@/lib/tools/runTool";

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const toolSlug = String(body.toolSlug || "").trim();
  const input = body.input && typeof body.input === "object" ? body.input : {};

  if (!toolSlug) {
    return NextResponse.json({ ok: false, error: "toolSlug required" }, { status: 400 });
  }
  const result = await runTool({ userId, toolSlug, input });

  if (!result.ok) {
    const status = result.error === "Rate limit exceeded" ? 429 : 400;
    return NextResponse.json({ ok: false, error: result.error, runId: result.runId }, { status });
  }

  return NextResponse.json({ ok: true, output: result.output, runId: result.runId });
}
