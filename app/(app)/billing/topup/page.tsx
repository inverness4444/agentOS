"use client";

import Link from "next/link";
import { useState } from "react";
import { CRYPTO_PAYMENT_NETWORKS } from "@/lib/billing/crypto";

export default function BillingTopupPage() {
  type NetworkKey = (typeof CRYPTO_PAYMENT_NETWORKS)[number]["key"];

  const defaultNetwork =
    (CRYPTO_PAYMENT_NETWORKS.find((item) => item.key === "TRC20")?.key ||
      CRYPTO_PAYMENT_NETWORKS[0]?.key ||
      "ERC20") as NetworkKey;

  const [paymentMethod, setPaymentMethod] = useState<"card" | "crypto">("crypto");
  const [networkKey, setNetworkKey] = useState<NetworkKey>(defaultNetwork);
  const [amountInput, setAmountInput] = useState("100");
  const [amount, setAmount] = useState(100);
  const [copiedKey, setCopiedKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedNetwork =
    CRYPTO_PAYMENT_NETWORKS.find((item) => item.key === networkKey) ||
    CRYPTO_PAYMENT_NETWORKS[0];

  const copyField = async (key: string, value: string) => {
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 1400);
    } catch {
      setError("Не удалось скопировать. Скопируйте вручную.");
    }
  };

  const applyAmount = () => {
    const numeric = Number(String(amountInput).replace(",", "."));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Введите корректную сумму.");
      return;
    }
    setError("");
    setAmount(Math.round(numeric * 100) / 100);
  };

  const submitPaid = async () => {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/billing/crypto-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: selectedNetwork.key,
          amount,
          note: `amount_usdt:${String(amount)}`
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось отправить заявку.");
      }
      setNotice("Заявка на пополнение по криптовалюте отправлена. Мы подтвердим поступление.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  };

  const amountLabel = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200/70 bg-white px-5 py-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-black">Пополнение</h1>
            <p className="mt-2 text-xs text-[#5A6072]">
              Выберите способ оплаты и используйте реквизиты ниже.
            </p>
          </div>
          <Link
            href="/billing"
            className="rounded-full border border-[#D8DDF7] bg-white px-4 py-1.5 text-xs font-semibold text-black"
          >
            Назад к биллингу
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod("card")}
            className={`rounded-full border px-3.5 py-1 text-[11px] font-semibold ${
              paymentMethod === "card"
                ? "border-[#5C5BD6] bg-[#EEF0FF] text-black"
                : "border-[#D8DDF7] bg-white text-black"
            }`}
          >
            Карта
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("crypto")}
            className={`rounded-full border px-3.5 py-1 text-[11px] font-semibold ${
              paymentMethod === "crypto"
                ? "border-[#5C5BD6] bg-[#EEF0FF] text-black"
                : "border-[#D8DDF7] bg-white text-black"
            }`}
          >
            Крипто
          </button>
        </div>

        {notice ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-black">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-black">
            {error}
          </div>
        ) : null}
      </div>

      {paymentMethod === "card" ? (
        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="text-sm font-semibold text-black">Оплата картой</div>
          <div className="mt-2 text-xs text-[#5A6072]">
            Карточная оплата будет добавлена на этой странице.
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-black">Сумма пополнения</div>
                <div className="mt-1 text-2xl font-semibold text-black">{amountLabel} USDT</div>
                <div className="mt-1 text-xs text-[#5A6072]">Сумма в долларах (USDT)</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="h-10 w-32 rounded-2xl border border-[#D8DDF7] bg-white px-3 text-base text-black outline-none"
                />
                <button
                  type="button"
                  onClick={applyAmount}
                  className="rounded-full border border-[#D8DDF7] bg-white px-4 py-1.5 text-xs font-semibold text-[#5A6072]"
                >
                  Изменить
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
            <div className="text-base font-semibold text-black">Криптовалюта (только USDT)</div>
            <div className="mt-1 text-xs text-[#5A6072]">Только USDT. Реквизиты добавим позже.</div>

            <div className="mt-4 flex flex-wrap gap-2">
              {CRYPTO_PAYMENT_NETWORKS.map((network) => (
                <button
                  key={network.key}
                  type="button"
                  onClick={() => setNetworkKey(network.key as NetworkKey)}
                  className={`rounded-full border px-3.5 py-1 text-[11px] font-semibold ${
                    networkKey === network.key
                      ? "border-[#5C5BD6] bg-[#EEF0FF] text-black"
                      : "border-[#D8DDF7] bg-white text-black"
                  }`}
                >
                  {network.key}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              <div>
                <div className="mb-1 text-[11px] font-semibold text-[#5A6072]">Сеть</div>
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3">
                  <div className="text-sm font-semibold text-black">{selectedNetwork.key}</div>
                  <button
                    type="button"
                    onClick={() => copyField("network", selectedNetwork.key)}
                    className="text-[11px] font-semibold text-[#5C5BD6]"
                  >
                    {copiedKey === "network" ? "Скопировано" : "Скопировать"}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold text-[#5A6072]">Адрес USDT</div>
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3">
                  <div className="min-w-0 break-all text-sm font-semibold text-black">
                    {selectedNetwork.address}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyField("address", selectedNetwork.address)}
                    className="shrink-0 text-[11px] font-semibold text-[#5C5BD6]"
                  >
                    {copiedKey === "address" ? "Скопировано" : "Скопировать"}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold text-[#5A6072]">Комментарий</div>
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3">
                  <div className="text-sm font-semibold text-black">—</div>
                  <button
                    type="button"
                    disabled
                    className="text-[11px] font-semibold text-[#A1ACC7]"
                  >
                    Скопировать
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 text-xs text-[#5A6072]">После оплаты нажмите «Я оплатил».</div>

            <button
              type="button"
              onClick={submitPaid}
              disabled={submitting}
              className="mt-4 w-full rounded-full bg-[#5C5BD6] px-5 py-2.5 text-base font-semibold text-black disabled:opacity-60"
            >
              {submitting ? "Отправка..." : "Я оплатил"}
            </button>
          </div>

        </>
      )}
    </div>
  );
}
