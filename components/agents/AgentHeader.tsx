import type { ReactNode } from "react";

type AgentHeaderProps = {
  name: string;
  avatarUrl?: string | null;
  statusLabel: string;
  published: boolean;
  onTogglePublished?: () => void;
  onBack?: () => void;
  tabs?: ReactNode;
};

export default function AgentHeader({
  name,
  avatarUrl,
  statusLabel: _statusLabel,
  published: _published,
  onTogglePublished: _onTogglePublished,
  onBack,
  tabs: _tabs
}: AgentHeaderProps) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white px-6 py-4 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-[#D8DDF7] bg-white px-3 py-2 text-xs font-semibold text-[#3E3A8C]"
          >
            Back
          </button>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="h-10 w-10 rounded-2xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-[#F4F6FF] text-sm font-semibold text-[#3E3A8C]">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">
              Agent
            </div>
            <div className="mt-1 text-lg font-semibold text-[#1F2238] sm:text-xl">
              {name}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
