type RunSetupCardProps = {
  setupText: string;
  onChange: (value: string) => void;
  examplePrompt: string;
  onInsertExample: () => void;
};

export default function RunSetupCard({
  setupText,
  onChange,
  examplePrompt,
  onInsertExample
}: RunSetupCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
      <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
        Setup
      </div>
      <textarea
        value={setupText}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="mt-3 w-full rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238]"
      />
      <div className="mt-4 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3 text-sm text-[#1F2238]">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">
          How to prompt this agent
        </div>
        <div className="mt-2 text-sm text-[#1F2238]">
          Example: {examplePrompt}
        </div>
        <button
          type="button"
          onClick={onInsertExample}
          className="mt-3 rounded-full border border-[#D8DDF7] bg-white px-3 py-1 text-[11px] font-semibold text-[#3E3A8C]"
        >
          Insert example
        </button>
      </div>
    </div>
  );
}
