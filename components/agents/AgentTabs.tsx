type AgentTab = "build" | "run";

type AgentTabsProps = {
  active: AgentTab;
  onChange: (tab: AgentTab) => void;
  showBuild?: boolean;
};

export default function AgentTabs({ active, onChange, showBuild = false }: AgentTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-[#F4F6FF] p-1 text-xs font-semibold text-[#3E3A8C] shadow-sm">
      {showBuild ? (
        <button
          type="button"
          onClick={() => onChange("build")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
            active === "build"
              ? "bg-white text-[#1F2238] shadow-sm"
              : "text-[#5A6072]"
          }`}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-[#F8F9FF] text-[10px]">
            B
          </span>
          Build
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onChange("run")}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 transition ${
          active === "run"
            ? "bg-white text-[#1F2238] shadow-sm"
            : "text-[#5A6072]"
        }`}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-[#F8F9FF] text-[10px]">
          R
        </span>
        Run
      </button>
    </div>
  );
}
