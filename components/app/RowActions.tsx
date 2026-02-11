"use client";

import { useRef } from "react";

type RowActionsProps = {
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
};

export default function RowActions({ onRename, onDuplicate, onDelete }: RowActionsProps) {
  const ref = useRef<HTMLDetailsElement | null>(null);

  const close = () => {
    if (ref.current) {
      ref.current.removeAttribute("open");
    }
  };

  const handle = (handler?: () => void) => {
    if (!handler) return;
    handler();
    close();
  };

  return (
    <details ref={ref} className="relative inline-block">
      <summary className="cursor-pointer list-none text-xs font-semibold text-[#4E4FE0]">
        •••
      </summary>
      <div className="absolute right-0 mt-2 w-36 rounded-xl border border-slate-200/70 bg-white p-2 text-xs text-[#1F2238] shadow-lg">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handle(onRename);
          }}
          className="w-full rounded-lg px-2 py-1 text-left hover:bg-[#F8F9FF]"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handle(onDuplicate);
          }}
          className="w-full rounded-lg px-2 py-1 text-left hover:bg-[#F8F9FF]"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handle(onDelete);
          }}
          className="w-full rounded-lg px-2 py-1 text-left text-red-500 hover:bg-red-50"
        >
          Delete
        </button>
      </div>
    </details>
  );
}
