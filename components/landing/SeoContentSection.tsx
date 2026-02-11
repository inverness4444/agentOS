import Link from "next/link";
import Section from "@/components/Section";
import { Card, CardContent } from "@/components/ui/card";

const fitItems = [
  "B2B-командам продаж, которым нужны лиды и персонализированный аутрич под РФ/СНГ.",
  "Маркетинговым отделам, которые выпускают контент в Reels/Shorts/TG/VK и хотят стабильный поток идей.",
  "Основателям и операционным руководителям, которым важны скорость запуска и контроль качества."
];

const useCases = [
  {
    title: "Лидогенерация и аутрич",
    text: "Собрать сегменты ICP, найти компании, подготовить персонализированные письма и DM-цепочки."
  },
  {
    title: "Контент-машина",
    text: "Сформировать рубрикатор, хуки, сценарии, визуальные ТЗ и repurpose одного материала в 10 форматов."
  },
  {
    title: "Решения на уровне руководства",
    text: "Запустить «Совет директоров»: CEO/CTO/CFO спорят по рискам, Chairman фиксирует решение и план на 7 дней."
  }
];

const howItWorks = [
  "Добавляете контекст компании и задачу.",
  "Выбираете нужный департамент: продажи, маркетинг или совет директоров.",
  "Получаете структурированный результат в JSON/таблицах и запускаете в работу."
];

export default function SeoContentSection() {
  return (
    <Section id="how-it-works">
      <div className="max-w-3xl">
        <p className="tag">Как работает</p>
        <h2 className="mt-4 text-3xl font-semibold text-[#2B2C4B] sm:text-4xl">
          Кому подходит AgentOS и какие задачи закрывает
        </h2>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <Card className="rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-[#1F2238]">Кому подходит</h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[#5A6072]">
              {fitItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-[#1F2238]">Кейсы использования</h3>
            <div className="mt-4 space-y-3 text-sm text-[#5A6072]">
              {useCases.map((item) => (
                <div key={item.title}>
                  <div className="font-semibold text-[#1F2238]">{item.title}</div>
                  <p className="mt-1">{item.text}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-[#1F2238]">Как работает</h3>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-[#5A6072]">
              {howItWorks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2 text-sm">
              <Link
                href="/pricing"
                data-analytics-event="cta_pricing_seo_section"
                data-analytics-label="seo_section_pricing"
                className="rounded-full border border-[#D8DDF7] px-3 py-1.5 font-semibold text-[#3E3A8C]"
              >
                Тарифы
              </Link>
              <Link
                href="/faq"
                data-analytics-event="cta_faq_seo_section"
                data-analytics-label="seo_section_faq"
                className="rounded-full border border-[#D8DDF7] px-3 py-1.5 font-semibold text-[#3E3A8C]"
              >
                FAQ
              </Link>
              <Link
                href="/register"
                data-analytics-event="cta_signup_seo_section"
                data-analytics-label="seo_section_signup"
                className="rounded-full bg-[#5C5BD6] px-3 py-1.5 font-semibold text-white"
              >
                Создать аккаунт
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
