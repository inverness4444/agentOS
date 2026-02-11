import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// No-op middleware.
// Required to make Next.js dev consistently emit middleware-manifest.json.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}
