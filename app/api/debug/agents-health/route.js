import { NextResponse } from "next/server";
import health from "../../../../lib/debug/agentsHealth.js";

const { runAgentsHealth } = health;

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await runAgentsHealth();
  return NextResponse.json(result);
}
