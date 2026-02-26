import { NextResponse } from "next/server";
import { getUserId } from "@/lib/server/auth";
import { SearchProviderError, searchWeb } from "@/lib/search/service.js";

export const runtime = "nodejs";

const toLimit = (value: string | null) => {
  if (!value) return 10;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 10;
  return Math.max(1, Math.min(50, Math.round(numeric)));
};

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get("q") || "").trim();
  const limit = toLimit(searchParams.get("limit"));
  const geo = String(searchParams.get("geo") || "").trim();
  const source = String(searchParams.get("source") || "").trim();

  if (!q) {
    return NextResponse.json(
      { ok: false, error: "INVALID_QUERY", message: "Query parameter q is required." },
      { status: 400 }
    );
  }

  try {
    const result = await searchWeb({ query: q, limit, geo, source });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SearchProviderError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.code,
          message: error.message,
          details: error.details || null
        },
        { status: error.status || 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json(
      { ok: false, error: "SEARCH_PROVIDER_ERROR", message },
      { status: 500 }
    );
  }
}
