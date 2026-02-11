import type { Metadata } from "next";
import LoginPageClient from "@/components/auth/LoginPageClient";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Вход в AgentOS",
  description: "Авторизация в AgentOS по email и паролю.",
  path: "/login",
  noIndex: true
});

export default function LoginPage() {
  return <LoginPageClient />;
}
