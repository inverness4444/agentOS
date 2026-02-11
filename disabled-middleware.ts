import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Keep middleware lightweight and stable in dev.
// Actual auth/role checks are enforced server-side in pages/API handlers.
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith("/api/admin/");

  if (!isAdminPath) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(
    request.cookies.get("__Secure-next-auth.session-token")?.value ||
      request.cookies.get("next-auth.session-token")?.value
  );

  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"]
};
