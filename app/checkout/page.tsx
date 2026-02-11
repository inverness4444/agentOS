import type { Metadata } from "next";
import Link from "next/link";
import Container from "@/components/Container";
import { pricing } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildPageMetadata({
  title: "Оформление доступа AgentOS",
  description: "Страница оформления подписки AgentOS.",
  path: "/checkout",
  noIndex: true
});

export default function CheckoutPage() {
  return (
    <main className="min-h-screen py-16">
      <Container>
        <Link href="/" className="text-sm text-[#2B2C4B] hover:text-[#2B2C4B]">
          ← Вернуться на главную
        </Link>
        <div className="mt-8 max-w-xl">
          <h1 className="text-3xl font-semibold">Оформление доступа</h1>
          <p className="mt-3 text-sm text-[#2B2C4B]">
            Это заглушка checkout. Здесь будет платёжный шаг.
          </p>
          <Card className="mt-8 rounded-2xl">
            <CardContent className="p-6">
              <div className="text-sm text-[#2B2C4B]">Тариф</div>
              <div className="mt-2 text-xl font-semibold">Единый доступ</div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-[#2B2C4B]">Стоимость</span>
                <span className="text-lg font-semibold">
                  {formatPrice(pricing.monthlyPrice)} {pricing.currency}
                </span>
              </div>
              <Button
                className="mt-6 w-full"
                size="lg"
                data-analytics-event="cta_checkout_pay_stub"
                data-analytics-label="checkout_pay_button"
              >
                Перейти к оплате
              </Button>
            </CardContent>
          </Card>
        </div>
      </Container>
    </main>
  );
}
