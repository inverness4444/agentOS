import PricingCard from "./PricingCard";
import Section from "./Section";

type FinalCTAProps = {
  price: number;
  currency: string;
  badge: string;
};

export default function FinalCTA({ price, currency, badge }: FinalCTAProps) {
  return (
    <Section>
      <div className="glass rounded-3xl p-8 md:p-12">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="tag">Финальный запуск</p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Подключите AgentOS и запустите отдел за сегодня
            </h2>
            <p className="mt-4 text-sm text-[#2B2C4B] sm:text-base">
              Всё готово: агенты, сценарии, департаменты и результаты. Начните
              запуск прямо сейчас.
            </p>
          </div>
          <PricingCard price={price} currency={currency} badge={badge} compact />
        </div>
      </div>
    </Section>
  );
}
