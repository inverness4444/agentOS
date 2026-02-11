import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import type { NextRequest } from "next/server";

const handler = NextAuth(authOptions);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isInternalLogRoute = (request: NextRequest) =>
  request.nextUrl.pathname.endsWith("/_log");

export async function GET(request: NextRequest, context: any) {
  if (isInternalLogRoute(request)) {
    return new Response(null, { status: 204 });
  }
  return handler(request, context);
}

export async function POST(request: NextRequest, context: any) {
  if (isInternalLogRoute(request)) {
    return new Response(null, { status: 204 });
  }
  return handler(request, context);
}
