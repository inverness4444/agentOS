type PromptEditorProps = {
  agentName: string;
  agentDescription: string;
  avatarUrl?: string | null;
  model: string;
  role: string;
  sop: string;
  output: string;
  onModelChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onSopChange: (value: string) => void;
  onOutputChange: (value: string) => void;
  onRefine?: () => void;
  onTest?: () => void;
};

export default function PromptEditor({
  agentName,
  agentDescription,
  avatarUrl,
  model,
  role,
  sop,
  output,
  onModelChange,
  onRoleChange,
  onSopChange,
  onOutputChange,
  onRefine,
  onTest
}: PromptEditorProps) {
  return (
    <section id="prompt" className="space-y-5">
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={agentName}
                className="h-14 w-14 rounded-2xl border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-[#F4F6FF] text-lg font-semibold text-[#3E3A8C]">
                {agentName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
                Prompt
              </div>
              <div className="mt-2 text-xl font-semibold text-[#1F2238]">
                {agentName}
              </div>
              <div className="mt-1 text-sm text-[#5A6072]">
                {agentDescription}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-slate-200 text-xs text-[#5A6072]"
          >
            ...
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={model}
            onChange={(event) => onModelChange(event.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#3E3A8C]"
          >
            <option value="gpt-4.1-mini">GPT 4.1 (latest)</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
            <option value="o3-mini">o3-mini</option>
          </select>
          <button
            type="button"
            onClick={onRefine}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#3E3A8C]"
          >
            Refine with AI
          </button>
          <button
            type="button"
            onClick={onTest}
            className="rounded-full bg-[#5C5BD6] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_18px_rgba(92,91,214,0.25)]"
          >
            Test agent
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <div className="text-sm font-semibold text-[#1F2238]">Role</div>
            <textarea
              value={role}
              onChange={(event) => onRoleChange(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-transparent bg-transparent px-4 py-3 text-sm text-[#1F2238] transition focus:border-slate-200 focus:bg-white"
              placeholder="Describe the role"
            />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1F2238]">SOP</div>
            <textarea
              value={sop}
              onChange={(event) => onSopChange(event.target.value)}
              rows={6}
              className="mt-2 w-full rounded-2xl border border-transparent bg-transparent px-4 py-3 text-sm text-[#1F2238] transition focus:border-slate-200 focus:bg-white"
              placeholder="Describe the process and steps"
            />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1F2238]">Output</div>
            <textarea
              value={output}
              onChange={(event) => onOutputChange(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-transparent bg-transparent px-4 py-3 text-sm text-[#1F2238] transition focus:border-slate-200 focus:bg-white"
              placeholder="Describe output format"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
