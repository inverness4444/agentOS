import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import PricingSection from "@/components/PricingSection";
import JsonLd from "@/components/seo/JsonLd";
import { pricing } from "@/lib/data";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildProductSchema } from "@/lib/seo/schema";

export const metadata: Metadata = buildPageMetadata({
  title: "Тарифы AgentOS — подписка для отдела продаж и маркетинга",
  description:
    "Тариф AgentOS: единый доступ к ИИ-агентам для лидогенерации, аутрича и контента. Цена в рублях, прозрачные условия и запуск без кода.",
  path: "/pricing",
  keywords: ["тариф agentos", "стоимость ии агентов", "подписка для отдела продаж", "цена ai платформы"]
});

export default function PricingPage() {
  return (
    <main>
      <JsonLd id="ld-pricing" data={buildProductSchema("/pricing")} />
      <Header />
      <section className="py-16">
        <Container>
          <h1 className="text-4xl font-semibold text-[#1F2238]">Тарифы AgentOS</h1>
          <p className="mt-3 max-w-2xl text-sm text-[#5A6072] sm:text-base">
            Единая подписка для команды: лиды, аутрич, контент и совет директоров в одном интерфейсе.
          </p>
          <p className="mt-2 text-sm text-[#1F2238]">
            Текущая стоимость: {pricing.monthlyPrice.toLocaleString("ru-RU")} {pricing.currency} в месяц.
          </p>
        </Container>
      </section>
      <PricingSection />
      <section className="pb-16">
        <Container>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-[#5A6072]">
            Подробные условия оплаты и возврата описаны в{" "}
            <Link
              href="/terms"
              data-analytics-event="cta_terms_pricing_page"
              data-analytics-label="pricing_page_terms"
              className="font-semibold text-[#4E4FE0]"
            >
              условиях использования
            </Link>
            . Частые вопросы собраны в{" "}
            <Link
              href="/faq"
              data-analytics-event="cta_faq_pricing_page"
              data-analytics-label="pricing_page_faq"
              className="font-semibold text-[#4E4FE0]"
            >
              FAQ
            </Link>
            .
          </div>
        </Container>
      </section>
      <Footer />
    </main>
  );
}
