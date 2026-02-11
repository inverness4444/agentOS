"use client";

import { useState } from "react";

type AdvancedModeToggleProps = {
  enabled: boolean;
};

export default function AdvancedModeToggle({ enabled }: AdvancedModeToggleProps) {
  const [value, setValue] = useState(enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/advanced-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !value })
      });
      if (!response.ok) {
        throw new Error("Не удалось обновить режим.");
      }
      const data = await response.json();
      setValue(Boolean(data.advancedMode));
    } catch (err) {
      setError("Не удалось обновить режим.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-5 py-4 text-sm text-[#1F2238]">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#7C7CF6]">Advanced Mode</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Конструктор workflow и расширенные настройки</div>
          <div className="mt-1 text-xs text-[#5A6072]">
            Включите, чтобы использовать Build/Publish для workforce.
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={loading}
          className={`rounded-full px-4 py-2 text-xs font-semibold ${
            value ? "bg-[#5C5BD6] text-white" : "border border-[#D8DDF7] bg-white text-[#3E3A8C]"
          }`}
        >
          {value ? "Включен" : "Выключен"}
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
    </div>
  );
}
