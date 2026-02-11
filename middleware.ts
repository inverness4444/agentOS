import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type RateState = { count: number; resetAt: number };

const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS = {
  api_global: 200,
  api_auth: 40,
  api_admin: 120
} as const;

const globalStore = globalThis as typeof globalThis & {
  __agentosMiddlewareRateStore?: Map<string, RateState>;
};
const rateStore = globalStore.__agentosMiddlewareRateStore || new Map<string, RateState>();
globalStore.__agentosMiddlewareRateStore = rateStore;

const getClientIp = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") || "unknown";
};

const checkLimit = (key: string, limit: number) => {
  const now = Date.now();
  const existing = rateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + RATE_WINDOW_MS };
    rateStore.set(key, next);
    return { allowed: true, resetAt: next.resetAt };
  }
  if (existing.count >= limit) {
    return { allowed: false, resetAt: existing.resetAt };
  }
  existing.count += 1;
  rateStore.set(key, existing);
  return { allowed: true, resetAt: existing.resetAt };
};

const makeCsp = (nonce: string) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join("; ");

const PRIVATE_PREFIXES = [
  "/admin",
  "/dashboard",
  "/account",
  "/app",
  "/agents",
  "/board",
  "/billing",
  "/tasks",
  "/tools",
  "/knowledge",
  "/workflow",
  "/workflows",
  "/workforce",
  "/login",
  "/register",
  "/auth"
];

const isPrivatePath = (pathname: string) =>
  PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const ip = getClientIp(request);
  const isApi = pathname.startsWith("/api/");

  if (!isApi && (request.method === "GET" || request.method === "HEAD")) {
    const url = request.nextUrl.clone();
    const host = request.headers.get("host") || "";
    const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
    const localHost = host.includes("localhost") || host.startsWith("127.0.0.1");
    const hasTrailingSlash = pathname.length > 1 && pathname.endsWith("/");
    const isWww = host.toLowerCase().startsWith("www.");
    const shouldForceHttps = process.env.NODE_ENV === "production" && proto === "http" && !localHost;

    if (hasTrailingSlash || isWww || shouldForceHttps) {
      if (hasTrailingSlash) {
        url.pathname = pathname.replace(/\/+$/, "");
      }
      if (isWww) {
        url.host = host.replace(/^www\./i, "");
      }
      if (shouldForceHttps) {
        url.protocol = "https:";
      }
      return NextResponse.redirect(url, 308);
    }
  }

  if (isApi) {
    const globalCheck = checkLimit(`api_global:${ip}`, RATE_LIMITS.api_global);
    if (!globalCheck.allowed) {
      return NextResponse.json(
        { error: "Too many requests", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": "60"
          }
        }
      );
    }

    if (pathname.startsWith("/api/auth/")) {
      const authCheck = checkLimit(`api_auth:${ip}`, RATE_LIMITS.api_auth);
      if (!authCheck.allowed) {
        return NextResponse.json(
          { error: "Too many auth requests", code: "RATE_LIMITED" },
          {
            status: 429,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "60"
            }
          }
        );
      }
    }

    if (pathname.startsWith("/api/admin/")) {
      const adminCheck = checkLimit(`api_admin:${ip}`, RATE_LIMITS.api_admin);
      if (!adminCheck.allowed) {
        return NextResponse.json(
          { error: "Too many admin requests", code: "RATE_LIMITED" },
          {
            status: 429,
            headers: {
              "Cache-Control": "no-store",
              "Retry-After": "60"
            }
          }
        );
      }
    }
  }

  const reqHeaders = new Headers(request.headers);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  reqHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: reqHeaders
    }
  });

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Content-Security-Policy", makeCsp(nonce));
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  if (!isApi && isPrivatePath(pathname)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
