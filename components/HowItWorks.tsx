import { outputs, steps } from "@/lib/data";
import Section from "./Section";
import StepCard from "./StepCard";
import { Card, CardContent } from "@/components/ui/card";

export default function HowItWorks() {
  return (
    <Section id="how">
      <div className="max-w-2xl">
        <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
          Три шага до готовых лидов и контента
        </h2>
        <p
          className="mt-3 text-sm sm:text-base"
          style={{ color: "#1F213D" }}
        >
          Весь цикл — от intake до готовых материалов — занимает минимум времени.
        </p>
      </div>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {steps.map((step, index) => (
          <StepCard
            key={step.title}
            index={index + 1}
            title={step.title}
            description={step.description}
          />
        ))}
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[#2B2C4B]">
              Пример лидов
            </div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200/70">
              <div className="grid grid-cols-3 bg-[#F0F2FF] text-[10px] uppercase tracking-[0.2em] text-[#2B2C4B]">
                <div className="px-3 py-2">Компания</div>
                <div className="px-3 py-2">Fit</div>
                <div className="px-3 py-2">Причина</div>
              </div>
              {outputs.leads.map((lead) => (
                <div
                  key={lead.company}
                  className="grid grid-cols-3 border-t border-slate-200/70 text-xs text-[#2B2C4B]"
                >
                  <div className="px-3 py-2">{lead.company}</div>
                  <div className="px-3 py-2">{lead.fit}</div>
                  <div className="px-3 py-2">{lead.note}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[#2B2C4B]">
              Пример cold email
            </div>
            <div className="mt-4 rounded-xl border border-slate-200/70 bg-[#F7F8FF] p-4 text-sm text-[#2B2C4B]">
              {outputs.email}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-[#2B2C4B]">
              Пример контент-плана
            </div>
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200/70 bg-[#F7F8FF] p-4 text-sm text-[#2B2C4B]">
              {outputs.content.map((line) => (
                <div key={line}>• {line}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
