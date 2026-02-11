import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      status: string;
      plan: string;
      advancedMode: boolean;
      twoFactorEnabled?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    status?: string;
    plan: string;
    advancedMode?: boolean;
    twoFactorEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    status?: string;
    plan?: string;
    advancedMode?: boolean;
    twoFactorEnabled?: boolean;
  }
}
