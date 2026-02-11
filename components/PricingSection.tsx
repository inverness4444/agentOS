import Section from "./Section";
import { pricing } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export default function PricingSection() {
  return (
    <Section id="pricing">
      <div className="max-w-2xl">
        <p className="tag">Тарифы</p>
        <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
          Одна подписка для всех
        </h2>
        <p
          className="mt-3 text-sm !text-black sm:text-base"
          style={{ color: "#000" }}
        >
          Получаете все 20 агентов, сценарии и обновления по подписке.
        </p>
      </div>
      <div className="mt-10 flex justify-center">
        <Card className="w-full max-w-3xl rounded-3xl">
          <CardContent className="p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#2B2C4B]">
                  Подписка
                </div>
                <div className="mt-2 text-2xl font-semibold">
                  Единый доступ ко всем агентам
                </div>
              </div>
              <Badge variant="accent">{pricing.badge}</Badge>
            </div>
            <Separator className="my-6" />
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold text-[#2B2C4B]">
                {formatPrice(pricing.monthlyPrice)} {pricing.currency}
              </span>
              <span className="text-sm text-[#2B2C4B]">в месяц</span>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-[#2B2C4B]">
              <li>20 агентов и готовые сценарии</li>
              <li>Единая подписка без скрытых платежей</li>
              <li>Обновления и новые агенты</li>
              <li>Поддержка запуска</li>
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link
                  href="/register"
                  data-analytics-event="cta_checkout_pricing"
                  data-analytics-label="pricing_get_access"
                >
                  Получить доступ
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="text-black">
                <Link
                  href="/demo"
                  data-analytics-event="cta_demo_pricing"
                  data-analytics-label="pricing_demo"
                >
                  Запросить демо
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
