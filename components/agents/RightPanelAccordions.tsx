import { useState } from "react";
import type { ReactNode } from "react";
import type { AgentConfig } from "@/lib/agents/config";

type SectionProps = {
  title: string;
  children: ReactNode;
};

const Section = ({ title, children }: SectionProps) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
          {title}
          <span className="text-[10px] text-[#5A6072]">{open ? "v" : ">"}</span>
        </span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-xs text-[#5A6072]">
          +
        </span>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

type RightPanelAccordionsProps = {
  config: AgentConfig;
};

export default function RightPanelAccordions({ config }: RightPanelAccordionsProps) {
  const visibleTriggers = config.triggers.filter((trigger) => trigger !== "manual");

  return (
    <div className="space-y-4">
      <Section title="Triggers">
        <div className="space-y-2 text-sm text-[#1F2238]">
          {visibleTriggers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-[#F8F9FF] px-3 py-4 text-center text-xs text-[#5A6072]">
              Add triggers to automatically start your agent based on events.
            </div>
          ) : (
            visibleTriggers.map((trigger) => (
              <div
                key={trigger}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {trigger}
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Tools">
        <div className="space-y-3">
          {config.tools.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-[#5A6072]">
              Инструменты не подключены
            </div>
          ) : (
            config.tools.map((tool) => (
              <div
                key={tool.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <div className="text-sm font-semibold text-[#1F2238]">{tool.name}</div>
                <div className="text-xs text-[#5A6072]">uses {tool.uses}</div>
              </div>
            ))
          )}
          <button
            type="button"
            className="w-full rounded-xl border border-[#D8DDF7] bg-white px-3 py-2 text-xs font-semibold text-[#3E3A8C]"
          >
            + Add tool
          </button>
        </div>
      </Section>

      <Section title="Knowledge">
        <div className="rounded-xl border border-dashed border-slate-200 bg-[#F8F9FF] px-3 py-6 text-center text-xs text-[#5A6072]">
          Drag & drop files here
        </div>
      </Section>

      <Section title="Variables">
        <div className="space-y-2 text-xs text-[#5A6072]">
          <div>
            Want to reuse values throughout your agent? Use variables like{" "}
            <span className="font-semibold text-[#3E3A8C]">{"{{var}}"}</span>
          </div>
          {config.variables.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {config.variables.map((variable) => (
                <span
                  key={variable}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-[#3E3A8C]"
                >
                  {`{{${variable}}}`}
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
