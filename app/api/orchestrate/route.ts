import { NextResponse } from "next/server";
import { runOrchestrator } from "@/lib/orchestrator";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await runOrchestrator(body || {});
  return NextResponse.json(result);
}
