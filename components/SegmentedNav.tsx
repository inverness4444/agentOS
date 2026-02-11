import { cn } from "@/lib/utils";
import { departments } from "@/lib/data";

const options = [
  ...departments.map((department) => ({
    label: department.navLabel,
    href: `#${department.id}`
  })),
  { label: "PRICING", href: "#pricing" }
];

type SegmentedNavProps = {
  className?: string;
};

export default function SegmentedNav({ className }: SegmentedNavProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2B2C4B] shadow-sm",
        className
      )}
    >
      {options.map((option) => (
        <a
          key={option.href}
          href={option.href}
          className="rounded-full px-3 py-2 transition hover:bg-[#F0F2FF] hover:text-[#2B2C4B]"
        >
          {option.label}
        </a>
      ))}
    </div>
  );
}
