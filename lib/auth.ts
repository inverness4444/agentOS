import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import allowlist from "@/lib/admin/allowlist.js";

const { isAllowlistedSuperAdminEmail } = allowlist as {
  isAllowlistedSuperAdminEmail: (email: string) => boolean;
};

type AuthAttemptState = {
  count: number;
  lockUntil: number;
};

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_BASE_LOCK_MS = 15_000;
const AUTH_MAX_LOCK_MS = 10 * 60 * 1000;
const AUTH_FAIL_BEFORE_LOCK = 5;

const globalAuthStore = globalThis as typeof globalThis & {
  __agentosAuthAttemptStore?: Map<string, AuthAttemptState>;
};
const authAttemptStore = globalAuthStore.__agentosAuthAttemptStore || new Map<string, AuthAttemptState>();
globalAuthStore.__agentosAuthAttemptStore = authAttemptStore;

const getAuthAttemptKey = (email: string, req: any) => {
  const xff = String(req?.headers?.["x-forwarded-for"] || "");
  const ip = xff.split(",")[0]?.trim() || String(req?.headers?.["x-real-ip"] || "local");
  return `${String(email || "").toLowerCase()}:${ip}`;
};

const getAuthAttemptState = (key: string) => {
  const now = Date.now();
  const existing = authAttemptStore.get(key);
  if (!existing) {
    return { count: 0, lockUntil: 0 };
  }
  if (existing.lockUntil && existing.lockUntil < now - AUTH_WINDOW_MS) {
    authAttemptStore.delete(key);
    return { count: 0, lockUntil: 0 };
  }
  return existing;
};

const recordAuthFailure = (key: string) => {
  const now = Date.now();
  const current = getAuthAttemptState(key);
  const nextCount = current.count + 1;
  let lockUntil = current.lockUntil;
  if (nextCount >= AUTH_FAIL_BEFORE_LOCK) {
    const power = Math.max(0, nextCount - AUTH_FAIL_BEFORE_LOCK);
    const lockMs = Math.min(AUTH_BASE_LOCK_MS * 2 ** power, AUTH_MAX_LOCK_MS);
    lockUntil = now + lockMs;
  }
  authAttemptStore.set(key, { count: nextCount, lockUntil });
};

const clearAuthFailure = (key: string) => {
  authAttemptStore.delete(key);
};

const warnMissing = (key: string) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing required env: ${key}`);
  }
  // eslint-disable-next-line no-console
  console.warn(`[auth] Missing env: ${key}`);
};

const hasDatabase = !!process.env.DATABASE_URL;
if (!hasDatabase) {
  warnMissing("DATABASE_URL");
}

const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-secret");

if (!nextAuthSecret) {
  warnMissing("NEXTAUTH_SECRET");
}

export const authOptions: NextAuthOptions = {
  adapter: hasDatabase ? PrismaAdapter(prisma) : undefined,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  secret: nextAuthSecret,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        if (!hasDatabase) {
          return null;
        }

        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password ?? "";
        const key = getAuthAttemptKey(email || "", req);
        const state = getAuthAttemptState(key);
        if (state.lockUntil > Date.now()) {
          return null;
        }

        if (!email || !password) {
          recordAuthFailure(key);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email }
        });

        if (!user || !user.passwordHash) {
          recordAuthFailure(key);
          return null;
        }

        if (String(user.status || "").toUpperCase() === "BLOCKED") {
          recordAuthFailure(key);
          return null;
        }

        let isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          const normalizedPassword = password.trim();
          if (normalizedPassword && normalizedPassword !== password) {
            isValid = await verifyPassword(normalizedPassword, user.passwordHash);
          }
        }
        if (!isValid) {
          recordAuthFailure(key);
          return null;
        }

        clearAuthFailure(key);

        let effectiveUser = user;
        const allowlisted = isAllowlistedSuperAdminEmail(email);
        if (allowlisted && user.role !== "SUPER_ADMIN") {
          effectiveUser = await prisma.user.update({
            where: { id: user.id },
            data: {
              role: "SUPER_ADMIN",
              status: "ACTIVE"
            }
          });
        }

        return {
          id: effectiveUser.id,
          email: effectiveUser.email,
          role: effectiveUser.role,
          status: effectiveUser.status,
          plan: effectiveUser.plan,
          advancedMode: effectiveUser.advancedMode,
          twoFactorEnabled: Boolean((effectiveUser as any).twoFactorEnabled)
        };
      }
    })
  ],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.status = (user as any).status;
        token.plan = (user as any).plan;
        token.advancedMode = (user as any).advancedMode;
        token.twoFactorEnabled = Boolean((user as any).twoFactorEnabled);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.status = (token.status as string) || "ACTIVE";
        session.user.plan = token.plan as string;
        session.user.advancedMode = Boolean(token.advancedMode);
        session.user.twoFactorEnabled = Boolean(token.twoFactorEnabled);
      }
      return session;
    }
  }
};
