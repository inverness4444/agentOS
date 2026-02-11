"use client";

import { useState } from "react";

type UserInfo = {
  id: string;
  email: string | null;
  name: string | null;
};

type CryptoRequest = {
  id: string;
  transactionId?: string | null;
  network: string;
  walletAddress: string;
  status: string;
  txHash?: string | null;
  note?: string | null;
  adminNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  user?: UserInfo;
  transaction?: {
    id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    metadataJson?: string | null;
  };
};

type BillingOperation = {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency?: string;
  occurredAt: string;
};

const statusLabel = (status: string) => {
  if (status === "APPROVED") return "Принято";
  if (status === "REJECTED") return "Отклонено";
  return "Ожидает";
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU");
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU");
};

const formatAmount = (value: number, currency = "RUB") => {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(abs)} ${currency}`;
};

const extractAmountLabel = (request: CryptoRequest) => {
  const fromTx = Number(request?.transaction?.amount || 0);
  if (fromTx > 0) {
    return `${fromTx.toLocaleString("ru-RU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })} ${String(request?.transaction?.currency || "USDT")}`;
  }

  const metadataRaw = String(request?.transaction?.metadataJson || "");
  if (metadataRaw) {
    try {
      const metadata = JSON.parse(metadataRaw);
      const fromMetadata = Number(
        metadata?.amount_usdt ?? metadata?.amountUsdt ?? metadata?.usdt_amount
      );
      if (Number.isFinite(fromMetadata) && fromMetadata > 0) {
        return `${fromMetadata.toLocaleString("ru-RU", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
        })} USDT`;
      }
    } catch {
      // ignore invalid metadata json
    }
  }

  const note = request?.note;
  const raw = String(note || "");
  const usdt =
    /amount_usdt\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /amount\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /([0-9]+(?:[.,][0-9]+)?)\s*usdt/i.exec(raw);
  if (!usdt) return "—";
  const value = Number(String(usdt[1]).replace(",", "."));
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })} USDT`;
};

export default function CryptoRequestsPanel({
  isAdmin,
  initialOperations,
  initialUserRequests,
  initialPendingRequests
}: {
  isAdmin: boolean;
  initialOperations: BillingOperation[];
  initialUserRequests: CryptoRequest[];
  initialPendingRequests: CryptoRequest[];
}) {
  const [operations, setOperations] = useState<BillingOperation[]>(initialOperations);
  const [userRequests, setUserRequests] = useState<CryptoRequest[]>(initialUserRequests);
  const [pendingRequests, setPendingRequests] = useState<CryptoRequest[]>(initialPendingRequests);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [busyId, setBusyId] = useState<string>("");
  const [error, setError] = useState<string>("");

  const ensureCsrfToken = async () => {
    if (!isAdmin) return "";
    if (csrfToken) return csrfToken;
    const response = await fetch("/api/admin/csrf", { cache: "no-store" });
    const token = response.headers.get("x-csrf-token") || "";
    setCsrfToken(token);
    return token;
  };

  const refresh = async () => {
    setError("");
    const [userResp, adminResp, operationsResp] = await Promise.all([
      fetch("/api/billing/crypto-requests"),
      isAdmin ? fetch("/api/billing/crypto-requests?scope=admin") : Promise.resolve(null),
      fetch("/api/billing/operations")
    ]);

    if (userResp.ok) {
      const payload = await userResp.json();
      const nextUserRequests = Array.isArray(payload.requests) ? payload.requests : [];
      setUserRequests(nextUserRequests);
    }

    if (operationsResp.ok) {
      const payload = await operationsResp.json();
      setOperations(Array.isArray(payload.operations) ? payload.operations : []);
    }

    if (adminResp && adminResp.ok) {
      const payload = await adminResp.json();
      setPendingRequests(Array.isArray(payload.requests) ? payload.requests : []);
    }
  };

  const review = async (requestItem: CryptoRequest, action: "approve" | "reject") => {
    setBusyId(requestItem.id);
    setError("");
    try {
      let response: Response;
      if (requestItem.transactionId) {
        const token = await ensureCsrfToken();
        const endpoint =
          action === "approve"
            ? `/api/admin/transactions/${requestItem.transactionId}/approve`
            : `/api/admin/transactions/${requestItem.transactionId}/reject`;
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": token
          },
          body:
            action === "approve"
              ? JSON.stringify({})
              : JSON.stringify({ reason: "Отклонено супер-админом" })
        });
      } else {
        const token = await ensureCsrfToken();
        response = await fetch(`/api/billing/crypto-requests/${requestItem.id}/review`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": token
          },
          body: JSON.stringify({ action })
        });
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Не удалось обработать заявку.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обработать заявку.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="text-2xl font-semibold text-black">История операций</div>
          <div className="mt-4 space-y-3">
            {operations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-4 py-5 text-sm text-[#5A6072]">
                Операций пока нет.
              </div>
            ) : (
              operations.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-black">{item.title}</div>
                    <div className="text-sm font-semibold text-black">
                      {item.amount >= 0 ? "+" : "-"}
                      {formatAmount(item.amount, item.currency || "RUB")}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[#5A6072]">{item.description}</div>
                  <div className="mt-1 text-xs text-[#5A6072]">{formatDateTime(item.occurredAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft">
          <div className="text-2xl font-semibold text-black">Заявки на пополнение</div>
          <div className="mt-4 space-y-3">
            {userRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-4 py-5 text-sm text-[#5A6072]">
                Заявок пока нет.
              </div>
            ) : (
              userRequests.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-black">Крипто · {item.network}</div>
                    <div className="text-sm font-semibold text-black">{extractAmountLabel(item)}</div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5A6072]">
                    <span>{statusLabel(item.status)}</span>
                    <span>·</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                  {item.adminNote ? (
                    <div className="mt-1 text-xs text-[#5A6072]">Комментарий: {item.adminNote}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-black">Очередь супер-админа</div>
              <div className="mt-1 text-sm text-[#5A6072]">
                Нажмите «Принять», чтобы подтвердить пополнение баланса пользователя.
              </div>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-full border border-[#D8DDF7] bg-white px-4 py-2 text-xs font-semibold text-black"
            >
              Обновить
            </button>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="mt-4 space-y-3">
            {pendingRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-4 py-5 text-sm text-[#5A6072]">
                Непроверенных заявок нет.
              </div>
            ) : (
              pendingRequests.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-black">
                      {item.user?.email || item.user?.name || "Пользователь"} · {item.network}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => review(item, "approve")}
                        disabled={busyId === item.id}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-60"
                      >
                        Принять
                      </button>
                      <button
                        type="button"
                        onClick={() => review(item, "reject")}
                        disabled={busyId === item.id}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
                      >
                        Отклонить
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[#5A6072] break-all">{item.walletAddress}</div>
                  <div className="mt-1 text-xs text-[#5A6072]">
                    Отправлено: {formatDateTime(item.createdAt)}
                  </div>
                  {item.txHash ? (
                    <div className="mt-1 text-xs text-[#5A6072] break-all">TxHash: {item.txHash}</div>
                  ) : null}
                  {item.note ? (
                    <div className="mt-1 text-xs text-[#5A6072]">Комментарий: {item.note}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
