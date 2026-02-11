import Section from "./Section";
import { Card, CardContent } from "@/components/ui/card";

const manualItems = [
  {
    title: "Ручная рутина",
    description: "Тратите 30 минут на каждого лида ради одного письма."
  },
  {
    title: "Ад копипаста",
    description: "Прыгаете между LinkedIn, Google и CRM."
  },
  {
    title: "Шаблонный аутрич",
    description: "Письма «Привет, {FirstName}», которые игнорируют."
  },
  {
    title: "Контент‑ступор",
    description: "Смотрите на пустой документ перед следующим постом."
  }
];

const automatedItems = [
  {
    title: "Мгновенный ресёрч",
    description: "Полный профиль лида за 30 секунд."
  },
  {
    title: "Один ввод — много результатов",
    description: "Вставили URL — получили ресёрч + письмо + тезисы."
  },
  {
    title: "Гипер‑персонализация",
    description: "Письма с реальными деталями о клиенте."
  },
  {
    title: "Бесконечные идеи",
    description: "Хуки, углы и контент по запросу."
  }
];

export default function Comparison() {
  return (
    <Section>
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-4 py-1 text-xs font-semibold text-[#2B2C4B] shadow-sm">
          До / После
        </span>
        <h2 className="mt-5 text-3xl font-semibold text-[#2B2C4B] sm:text-4xl">
          Перестаньте делать работу ИИ.
        </h2>
        <p
          className="mt-3 text-sm sm:text-base"
          style={{ color: "#111827", opacity: 1 }}
        >
          Вы запускали бизнес не для того, чтобы тратить 10 часов в неделю на
          ресёрч и ручной ввод данных.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border border-[#F2B8BE] bg-[#FCEEEF] shadow-soft">
          <CardContent className="p-7">
            <h3 className="text-xl font-semibold text-[#B24850]">
              Ручной режим
            </h3>
            <p className="mt-1 text-sm text-[#2B2C4B]">
              Скорее всего, так сейчас и работаете.
            </p>
            <ul className="mt-6 space-y-5 text-sm text-[#2B2C4B]">
              {manualItems.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#F2B8BE] bg-[#FBE3E6] text-sm font-semibold text-[#B24850]">
                    ×
                  </span>
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 text-[#2B2C4B]">
                      {item.description}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-[#C7CBFF] bg-white/90 shadow-soft">
          <CardContent className="p-7">
            <h3 className="text-xl font-semibold text-[#4E4FE0]">
              Автоматизированный режим
            </h3>
            <p className="mt-1 text-sm text-[#2B2C4B]">
              Что меняется с этими агентами.
            </p>
            <ul className="mt-6 space-y-5 text-sm text-[#2B2C4B]">
              {automatedItems.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#C7CBFF] bg-[#EEF0FF] text-sm font-semibold text-[#4E4FE0]">
                    ✓
                  </span>
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 text-[#2B2C4B]">
                      {item.description}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
