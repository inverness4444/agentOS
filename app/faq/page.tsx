import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import JsonLd from "@/components/seo/JsonLd";
import { faqs } from "@/lib/data";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildFaqSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildPageMetadata({
  title: "FAQ AgentOS — вопросы о цене, безопасности и запуске",
  description:
    "Ответы на частые вопросы о AgentOS: цена подписки, безопасность данных, сценарии использования, поддержка и запуск.",
  path: "/faq",
  keywords: ["faq agentos", "цена agentos", "безопасность данных ai", "как работает agentos"]
});

export default function FaqPage() {
  return (
    <main className="min-h-screen py-16">
      <JsonLd id="ld-faq" data={buildFaqSchema(faqs)} />
      <Container>
        <Link href="/" className="text-sm text-[#2B2C4B] hover:text-[#2B2C4B]">
          ← Вернуться на главную
        </Link>
        <div className="mt-8 max-w-3xl space-y-6 text-sm text-[#2B2C4B]">
          <div>
            <h1 className="text-3xl font-semibold text-[#2B2C4B]">
              FAQ — agentOS
            </h1>
            <p className="mt-2">
              Популярные вопросы и ответы о сервисе.
            </p>
          </div>
          <div className="space-y-6">
            {faqs.map((item) => (
              <div key={item.question} className="space-y-2">
                <h2 className="text-lg font-semibold text-[#2B2C4B]">
                  {item.question}
                </h2>
                <p className="whitespace-pre-line">{item.answer}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p>
              Не нашли ответ? Посмотрите{" "}
              <Link
                href="/pricing"
                data-analytics-event="cta_pricing_faq_page"
                data-analytics-label="faq_page_pricing"
                className="font-semibold text-[#4E4FE0]"
              >
                тарифы
              </Link>{" "}
              или создайте{" "}
              <Link
                href="/register"
                data-analytics-event="cta_signup_faq_page"
                data-analytics-label="faq_page_signup"
                className="font-semibold text-[#4E4FE0]"
              >
                аккаунт
              </Link>
              .
            </p>
          </div>
        </div>
      </Container>
    </main>
  );
}
