export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-12 w-full animate-pulse rounded-2xl bg-white/70"
        />
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200/70 bg-white px-6 py-8 text-center">
      <div className="text-lg font-semibold text-[#1F2238]">{title}</div>
      <p className="mt-2 text-sm text-[#5A6072] whitespace-normal break-words">
        {description}
      </p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
      {message}
    </div>
  );
}
