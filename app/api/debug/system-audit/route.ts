import { NextResponse } from "next/server";
import audit from "../../../../lib/debug/systemAudit.js";

const { runSystemAudit } = audit as {
  runSystemAudit: (options?: { runSmoke?: boolean }) => Promise<unknown>;
};

const toBool = (value: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const runSmoke = toBool(url.searchParams.get("run_smoke"));
  const result = await runSystemAudit({ runSmoke });
  return NextResponse.json(result);
}
