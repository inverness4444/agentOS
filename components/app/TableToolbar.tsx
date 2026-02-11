type TableToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  columnsLabel?: string;
  sortLabel?: string;
  onColumns?: () => void;
  onSort?: () => void;
};

export default function TableToolbar({
  search,
  onSearch,
  placeholder,
  columnsLabel = "Столбцы: (3)",
  sortLabel = "Сортировка: Последнее изменение",
  onColumns,
  onSort
}: TableToolbarProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder ?? "Поиск"}
          className="w-full min-w-[220px] flex-1 rounded-2xl border border-slate-200/70 bg-white px-4 py-2 text-sm text-[#1F2238] outline-none transition focus:border-[#5C5BD6] focus:ring-2 focus:ring-[#5C5BD6]/20"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onColumns}
          className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-xs font-semibold text-[#3E3A8C]"
        >
          {columnsLabel}
        </button>
        <button
          type="button"
          onClick={onSort}
          className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-xs font-semibold text-[#3E3A8C]"
        >
          {sortLabel}
        </button>
      </div>
    </div>
  );
}
