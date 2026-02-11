type BuildSidebarNavProps = {
  sections: { id: string; label: string; description: string }[];
};

export default function BuildSidebarNav({ sections }: BuildSidebarNavProps) {
  return (
    <div className="sticky top-6 flex flex-col rounded-3xl border border-slate-200/70 bg-white p-4 shadow-soft">
      <nav className="flex flex-col gap-2 text-sm text-[#1F2238]">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={`rounded-2xl border px-3 py-3 transition ${
              section.id === "prompt"
                ? "border-[#C9D2FF] bg-[#F4F6FF]"
                : "border-transparent hover:border-[#D8DDF7] hover:bg-[#F8F9FF]"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#3E3A8C]">
                {section.label.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div className="text-sm font-semibold text-[#1F2238]">
                  {section.label}
                </div>
                <div className="text-xs text-[#5A6072]">
                  {section.description}
                </div>
              </div>
            </div>
          </a>
        ))}
      </nav>
      <div className="mt-4 border-t border-slate-200/70 pt-4 text-xs text-[#5A6072]">
        <div className="rounded-2xl px-3 py-2 transition hover:bg-[#F4F6FF]">
          Advanced
        </div>
        <div className="rounded-2xl px-3 py-2 transition hover:bg-[#F4F6FF]">
          Need help?
        </div>
      </div>
    </div>
  );
}
