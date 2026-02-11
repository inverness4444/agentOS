import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import { Card, CardContent } from "@/components/ui/card";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Контакты AgentOS",
  description: "Контакты AgentOS для поддержки, партнёрств и рабочих вопросов по внедрению AI-агентов.",
  path: "/contacts",
  keywords: ["контакты agentos", "поддержка agentos", "связаться с agentos"]
});

export default function ContactsPage() {
  return (
    <main className="min-h-screen py-16">
      <Container>
        <Link href="/" className="text-sm text-[#2B2C4B] hover:text-[#2B2C4B]">
          ← Вернуться на главную
        </Link>
        <div className="mt-8 max-w-2xl space-y-4 text-sm text-[#2B2C4B]">
          <h1 className="text-3xl font-semibold text-[#2B2C4B]">Контакты</h1>
          <p>Команда AgentOS на связи для партнёрств и поддержки.</p>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <div>Почта: hello@agentos.ru (заглушка)</div>
              <div className="mt-2">Telegram: @agentos (заглушка)</div>
            </CardContent>
          </Card>
        </div>
      </Container>
    </main>
  );
}
