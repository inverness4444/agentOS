import PricingCard from "./PricingCard";
import Section from "./Section";

type MidPriceCTAProps = {
  price: number;
  currency: string;
  badge: string;
};

export default function MidPriceCTA({ price, currency, badge }: MidPriceCTAProps) {
  return (
    <Section>
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="tag">Доступ</p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Подключите AgentOS
          </h2>
          <p className="mt-4 text-sm text-[#2B2C4B] sm:text-base">
            Полный доступ ко всем агентам, сценариям и обновлениям.
          </p>
        </div>
        <PricingCard price={price} currency={currency} badge={badge} compact />
      </div>
    </Section>
  );
}
