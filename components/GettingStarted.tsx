import Section from "./Section";
import { Card, CardContent } from "@/components/ui/card";

type GettingStartedStep = {
  id: string;
  title: string;
  description: string;
  time: string;
  icon: JSX.Element;
};

const IconGift = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 11h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8Z" />
    <path d="M3 7h18v4H3z" />
    <path d="M12 7v14" />
    <path d="M12 7H9.5a2.5 2.5 0 1 1 0-5C11 2 12 4 12 7Z" />
    <path d="M12 7h2.5a2.5 2.5 0 1 0 0-5C13 2 12 4 12 7Z" />
  </svg>
);

const IconChip = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="7" y="7" width="10" height="10" rx="2" />
    <path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" />
  </svg>
);

const IconGrid = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const IconPlay = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5 16 12l-6 3.5z" fill="currentColor" />
  </svg>
);

const steps: GettingStartedStep[] = [
  {
    id: "01",
    title: "Покупка и доступ",
    description: "Доступ приходит на email со ссылками на всех агентов.",
    time: "МГНОВЕННО",
    icon: <IconGift />
  },
  {
    id: "02",
    title: "Подключение к AgentOS",
    description: "Один клик — и рабочее пространство готово.",
    time: "2 МИНУТЫ",
    icon: <IconChip />
  },
  {
    id: "03",
    title: "Настройте входные данные",
    description: "Добавьте API-ключи и настройте под ваш кейс.",
    time: "5 МИНУТ",
    icon: <IconGrid />
  },
  {
    id: "04",
    title: "Запустите первого агента",
    description: "Дайте первое задание и смотрите, как он сразу работает.",
    time: "30 СЕКУНД",
    icon: <IconPlay />
  }
];

export default function GettingStarted() {
  return (
    <Section>
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-5 py-1 text-xs font-semibold text-[#2B2C4B] shadow-sm">
          Быстрый старт
        </span>
        <h2 className="mt-5 text-3xl font-semibold text-[#2B2C4B] sm:text-4xl">
          Запуск за <span className="text-[#4E4FE0]">10 минут</span>.
        </h2>
        <p className="mt-3 text-sm text-[#2B2C4B] sm:text-base">
          Без сложной настройки. Без проектов на выходные.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <Card key={step.id} className="rounded-3xl border border-slate-200/70 bg-white/90 shadow-soft">
            <CardContent className="p-5">
              <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#4E4FE0] via-[#3F3CC7] to-[#2C2A74]">
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:18px_18px] opacity-40" />
                <span className="absolute left-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white text-xs font-semibold text-[#4E4FE0] shadow-sm">
                  {step.id}
                </span>
                <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#4E4FE0] shadow-sm">
                  {step.icon}
                </div>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-[#2B2C4B]">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-[#2B2C4B]">{step.description}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#2B2C4B]">
                {step.time}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}
