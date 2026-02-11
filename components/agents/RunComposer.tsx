type RunComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  isRunning: boolean;
};

export default function RunComposer({
  value,
  onChange,
  onSend,
  placeholder,
  isRunning
}: RunComposerProps) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-soft">
      <div className="flex items-end gap-3">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (value.trim().length > 0 && !isRunning) {
                onSend();
              }
            }
          }}
          rows={3}
          placeholder={placeholder}
          className="w-full resize-none rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-[#1F2238]"
        />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onSend}
            disabled={isRunning || value.trim().length === 0}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5C5BD6] text-[11px] font-semibold text-white disabled:opacity-50"
          >
            Send
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D8DDF7] bg-white text-[11px] font-semibold text-[#3E3A8C]"
          >
            Mic
          </button>
        </div>
      </div>
    </div>
  );
}
