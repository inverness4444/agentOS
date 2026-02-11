"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SubscriptionToggleButton({
  hasSubscription,
  cancelScheduled,
  daysLeft,
  currentBalance,
  priceRub
}: {
  hasSubscription: boolean;
  cancelScheduled: boolean;
  daysLeft: number | null;
  currentBalance: number;
  priceRub: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const onClick = async () => {
    if (cancelScheduled && hasSubscription) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const action = hasSubscription ? "unsubscribe" : "subscribe";
      const response = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось изменить подписку.");
      }
      if (payload?.message) {
        setNotice(String(payload.message));
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить подписку.");
    } finally {
      setBusy(false);
    }
  };

  const needTopup = !hasSubscription && currentBalance < priceRub;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy || (cancelScheduled && hasSubscription)}
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
      >
        {busy
          ? "Обработка..."
          : hasSubscription
            ? cancelScheduled
              ? "Отключится по периоду"
              : "Отключить"
            : "Подключить"}
      </button>
      {needTopup ? (
        <div className="text-xs text-[#5A6072]">
          Нужно минимум {priceRub.toLocaleString("ru-RU")} ₽ на балансе.
        </div>
      ) : null}
      {cancelScheduled && hasSubscription ? (
        <div className="text-xs text-[#5A6072]">
          Подписка отменится через {daysLeft ?? 0} дн. по окончании оплаченного периода.
        </div>
      ) : null}
      {notice ? <div className="text-xs text-[#5A6072]">{notice}</div> : null}
      {error ? <div className="text-xs text-rose-600">{error}</div> : null}
    </div>
  );
}
