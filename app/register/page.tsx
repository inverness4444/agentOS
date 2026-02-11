import type { Metadata } from "next";
import RegisterPageClient from "@/components/auth/RegisterPageClient";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Регистрация в AgentOS",
  description: "Создание аккаунта AgentOS для доступа к AI-агентам и рабочим сценариям.",
  path: "/register",
  noIndex: true
});

export default function RegisterPage() {
  return <RegisterPageClient />;
}
