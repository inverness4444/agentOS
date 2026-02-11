"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TabKey = "users" | "topups" | "transactions";

type BasicUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  status: string;
  plan?: string;
  balanceCache?: number;
  createdAt?: string;
};

type AdminMe = {
  id: string;
  email?: string | null;
  role: string;
  status: string;
  twoFactorEnabled: boolean;
  twoFactorVerified: boolean;
  twoFactorRequired?: boolean;
};

type TopupTx = {
  id: string;
  source: "transaction" | "billing_request";
  requestId?: string;
  transactionId?: string | null;
  type: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  note?: string | null;
  metadataJson?: string | null;
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
  } | null;
};

type HistoryTx = {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  comment?: string | null;
  createdAt: string;
  user?: {
    id: string;
    email?: string | null;
    name?: string | null;
  } | null;
};

const navItems: Array<{ key: TabKey; label: string; href: string }> = [
  { key: "users", label: "Пользователи", href: "/admin/users" },
  { key: "topups", label: "Заявки на пополнение", href: "/admin/topups" },
  { key: "transactions", label: "Транзакции", href: "/admin/transactions" }
];

const textInputClass =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-black outline-none focus:border-[#5C5BD6]";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-full bg-[#5C5BD6] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60";

const formatDate = (raw?: string) => {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU");
};

const formatAmount = (amount: number, currency: string) =>
  `${Number(amount || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const formatTopupAmount = (item: TopupTx) => {
  const amount = Number(item.amount || 0);
  if (item.method === "crypto" && amount <= 0) {
    return "Не указана";
  }
  return formatAmount(amount, item.currency);
};

const parseAmountFromNote = (note?: string | null) => {
  const raw = String(note || "");
  const match =
    /amount_usdt\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /amount\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /([0-9]+(?:[.,][0-9]+)?)\s*usdt/i.exec(raw);
  if (!match) return 0;
  const value = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};

const parseAmountFromMetadata = (metadataJson?: string | null) => {
  if (!metadataJson) return 0;
  try {
    const metadata = JSON.parse(metadataJson);
    const value = Number(
      metadata?.amount_usdt ?? metadata?.amountUsdt ?? metadata?.usdt_amount ?? 0
    );
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const roleLabel = (role: string) => {
  if (role === "SUPER_ADMIN") return "Супер-админ";
  if (role === "ADMIN") return "Админ";
  return "Менеджер";
};

const statusLabel = (status: string) => {
  if (status === "EXECUTED" || status === "APPROVED" || status === "ACTIVE") return "Обработано";
  if (status === "REJECTED" || status === "FAILED" || status === "BLOCKED") return "Отклонено";
  return "Ожидает";
};

export default function AdminPanel({ initialTab = "users" }: { initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [csrfToken, setCsrfToken] = useState("");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [users, setUsers] = useState<BasicUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersQuery, setUsersQuery] = useState("");
  const [usersRole, setUsersRole] = useState("");
  const [usersStatus, setUsersStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserDetails, setSelectedUserDetails] = useState<any>(null);
  const [editRole, setEditRole] = useState("USER");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editReason, setEditReason] = useState("");

  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const [topups, setTopups] = useState<TopupTx[]>([]);
  const [topupsPage, setTopupsPage] = useState(1);
  const [topupsQuery, setTopupsQuery] = useState("");
  const [topupsType, setTopupsType] = useState("");
  const [approveAmountByTx, setApproveAmountByTx] = useState<Record<string, string>>({});
  const [rejectReasonByTx, setRejectReasonByTx] = useState<Record<string, string>>({});

  const [historyRows, setHistoryRows] = useState<HistoryTx[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyType, setHistoryType] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const safeJson = async (response: Response) => response.json().catch(() => ({}));

  const apiGet = async (url: string) => {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(payload.error || payload.code || "Request failed");
    }
    return payload;
  };

  const apiPost = async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: JSON.stringify(body)
    });
    const payload = await safeJson(response);
    if (!response.ok) {
      throw new Error(payload.error || payload.code || "Request failed");
    }
    return payload;
  };

  const loadMe = async () => {
    const payload = await apiGet("/api/admin/me");
    setMe(payload.user || null);
  };

  const loadCsrf = async () => {
    const response = await fetch("/api/admin/csrf", { cache: "no-store" });
    if (!response.ok) return;
    const token = response.headers.get("x-csrf-token") || "";
    setCsrfToken(token);
  };

  const loadUsers = async () => {
    const params = new URLSearchParams({
      page: String(usersPage),
      pageSize: "20"
    });
    if (usersQuery.trim()) params.set("q", usersQuery.trim());
    if (usersRole) params.set("role", usersRole);
    if (usersStatus) params.set("status", usersStatus);
    const payload = await apiGet(`/api/admin/users?${params.toString()}`);
    setUsers(payload.users || []);
    setUsersTotal(Number(payload.total || 0));
  };

  const loadUserDetails = async (id: string) => {
    if (!id) return;
    const payload = await apiGet(`/api/admin/users/${id}`);
    setSelectedUserDetails(payload);
    setEditRole(String(payload?.user?.role || "USER"));
    setEditStatus(String(payload?.user?.status || "ACTIVE"));
    setAdjustUserId(id);
  };

  const loadTopups = async () => {
    const params = new URLSearchParams({
      page: String(topupsPage),
      pageSize: "30"
    });
    if (topupsQuery.trim()) params.set("q", topupsQuery.trim());
    const [pendingPayload, billingPayload] = await Promise.all([
      apiGet(`/api/admin/transactions/pending?${params.toString()}`).catch(() => ({
        transactions: []
      })),
      apiGet("/api/billing/crypto-requests?scope=admin").catch(() => ({
        requests: []
      }))
    ]);

    const billingRequests = Array.isArray((billingPayload as any)?.requests)
      ? ((billingPayload as any).requests as any[])
      : [];

    const billingRows: TopupTx[] = billingRequests.map((item) => {
      // Prefer explicit amount from note, fallback to linked transaction amount for legacy rows.
      // This keeps old pending requests from displaying as 0.00 USDT.
      const parsedAmount = parseAmountFromNote(item.note);
      const metadataAmount = parseAmountFromMetadata(item?.transaction?.metadataJson);
      const fallbackAmount = Number(item?.transaction?.amount || 0);
      const resolvedAmount =
        parsedAmount > 0 ? parsedAmount : metadataAmount > 0 ? metadataAmount : fallbackAmount;
      return {
      amount: resolvedAmount,
      id: String(item.id),
      source: "billing_request",
      requestId: String(item.id),
      transactionId: item.transactionId ? String(item.transactionId) : null,
      type: "CRYPTO_TOPUP",
      method: "crypto",
      currency: String(item?.transaction?.currency || "USDT"),
      status: String(item.status || "PENDING"),
      createdAt: String(item.createdAt || new Date().toISOString()),
      note: item.note ? String(item.note) : null,
      metadataJson: item?.transaction?.metadataJson ? String(item.transaction.metadataJson) : null,
      user: item.user
        ? {
            id: String(item.user.id || ""),
            email: item.user.email ? String(item.user.email) : null,
            name: item.user.name ? String(item.user.name) : null
          }
        : null
    };
    });

    const linkedTxIds = new Set(
      billingRows.map((row) => row.transactionId).filter((id): id is string => Boolean(id))
    );

    const pendingTransactions = Array.isArray((pendingPayload as any)?.transactions)
      ? ((pendingPayload as any).transactions as any[])
      : [];

    const txRows: TopupTx[] = pendingTransactions
      .filter((item) => !linkedTxIds.has(String(item.id)))
      .map((item) => {
        const type = String(item.type || "");
        const method =
          type === "CRYPTO_TOPUP"
            ? "crypto"
            : type === "MANUAL_DEPOSIT"
              ? "manual_deposit"
              : type === "ADMIN_ADJUSTMENT"
                ? "admin_adjustment"
                : type.toLowerCase();
        return {
          id: String(item.id),
          source: "transaction",
          transactionId: String(item.id),
          type,
          method,
          amount:
            type === "CRYPTO_TOPUP"
              ? parseAmountFromMetadata(item.metadataJson) || Number(item.amount || 0)
              : Number(item.amount || 0),
          currency: String(item.currency || "RUB"),
          status: String(item.status || "PENDING_APPROVAL"),
          createdAt: String(item.createdAt || new Date().toISOString()),
          note: null,
          metadataJson: item.metadataJson ? String(item.metadataJson) : null,
          user: item.user
            ? {
                id: String(item.user.id || ""),
                email: item.user.email ? String(item.user.email) : null,
                name: item.user.name ? String(item.user.name) : null
              }
            : null
        };
      });

    const q = topupsQuery.trim().toLowerCase();
    const byQuery = (row: TopupTx) => {
      if (!q) return true;
      const haystack = `${row.user?.email || ""} ${row.user?.name || ""} ${row.id} ${row.requestId || ""}`.toLowerCase();
      return haystack.includes(q);
    };

    const byType = (row: TopupTx) => {
      if (!topupsType) return true;
      return row.method.toLowerCase() === topupsType.toLowerCase();
    };

    const merged = [...billingRows, ...txRows]
      .filter((row) => byQuery(row) && byType(row))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    setTopups(merged);
  };

  const loadHistory = async () => {
    const params = new URLSearchParams({
      page: String(historyPage),
      pageSize: "30"
    });
    if (historyQuery.trim()) params.set("q", historyQuery.trim());
    if (historyType) params.set("type", historyType);
    if (historyStatus) params.set("status", historyStatus);
    if (historyDateFrom) params.set("dateFrom", historyDateFrom);
    if (historyDateTo) params.set("dateTo", historyDateTo);
    const payload = await apiGet(`/api/admin/transactions?${params.toString()}`);
    setHistoryRows((payload.transactions || []) as HistoryTx[]);
    setHistoryTotal(Number(payload.total || 0));
  };

  const bootstrap = async () => {
    setBusy(true);
    setError("");
    try {
      await loadCsrf();
      await loadMe();
    } catch (err: any) {
      setError(err?.message || "Не удалось загрузить данные администратора.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!me) return;
    if (tab === "users") {
      loadUsers().catch((err) => setError(err.message));
      return;
    }
    if (tab === "topups") {
      loadTopups().catch((err) => setError(err.message));
      return;
    }
    if (tab === "transactions") {
      loadHistory().catch((err) => setError(err.message));
    }
  }, [tab, usersPage, topupsPage, historyPage, me]);

  useEffect(() => {
    if (!selectedUserId || !me || tab !== "users") return;
    loadUserDetails(selectedUserId).catch((err) => setError(err.message));
  }, [selectedUserId, me, tab]);

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err: any) {
      setError(err?.message || "Операция завершилась ошибкой.");
    } finally {
      setBusy(false);
    }
  };

  const onChangeRole = async () =>
    runAction(async () => {
      if (!selectedUserId) return;
      if (!window.confirm("Подтвердить смену роли пользователя?")) return;
      await apiPost(`/api/admin/users/${selectedUserId}/role`, {
        role: editRole,
        reason: editReason
      });
      setNotice("Роль обновлена.");
      await loadUsers();
      await loadUserDetails(selectedUserId);
    });

  const onChangeStatus = async () =>
    runAction(async () => {
      if (!selectedUserId) return;
      if (!window.confirm("Подтвердить изменение статуса пользователя?")) return;
      await apiPost(`/api/admin/users/${selectedUserId}/status`, {
        status: editStatus,
        reason: editReason
      });
      setNotice("Статус пользователя обновлён.");
      await loadUsers();
      await loadUserDetails(selectedUserId);
    });

  const onAdjustBalance = async () =>
    runAction(async () => {
      if (!window.confirm("Создать заявку на изменение баланса?")) return;
      await apiPost("/api/admin/balance/adjust", {
        userId: adjustUserId,
        delta: Number(adjustDelta),
        reason: adjustReason,
        currency: "RUB"
      });
      setNotice("Заявка на изменение баланса создана.");
      setAdjustDelta("");
      setAdjustReason("");
      if (adjustUserId) {
        await loadUserDetails(adjustUserId);
      }
      if (tab === "topups") {
        await loadTopups();
      }
    });

  const onApproveTopup = async (item: TopupTx) =>
    runAction(async () => {
      if (!window.confirm("Подтвердить транзакцию?")) return;
      const typedAmount = Number(String(approveAmountByTx[item.id] || "").replace(",", "."));
      const resolvedAmountUsdt =
        Number.isFinite(typedAmount) && typedAmount > 0
          ? Math.round(typedAmount * 100) / 100
          : Number(item.amount || 0) > 0
            ? Math.round(Number(item.amount || 0) * 100) / 100
            : null;

      if (item.source === "billing_request") {
        if (item.method === "crypto" && !resolvedAmountUsdt) {
          throw new Error("Укажите сумму USDT перед подтверждением заявки.");
        }
        await apiPost(`/api/billing/crypto-requests/${item.requestId || item.id}/review`, {
          action: "approve",
          ...(resolvedAmountUsdt ? { amountUsdt: resolvedAmountUsdt } : {})
        });
        setNotice("Заявка на пополнение подтверждена.");
      } else {
        if (item.method === "crypto" && Number(item.amount || 0) <= 0) {
          throw new Error(
            "Нельзя подтвердить крипто-транзакцию без суммы. Укажите сумму через заявку пользователя."
          );
        }
        await apiPost(`/api/admin/transactions/${item.id}/approve`, {});
        setNotice("Транзакция подтверждена.");
      }
      await loadTopups();
      if (selectedUserId) await loadUserDetails(selectedUserId);
    });

  const onRejectTopup = async (item: TopupTx) =>
    runAction(async () => {
      if (!window.confirm("Отклонить транзакцию?")) return;
      const reason = rejectReasonByTx[item.id] || "Отклонено супер-админом";
      if (item.source === "billing_request") {
        await apiPost(`/api/billing/crypto-requests/${item.requestId || item.id}/review`, {
          action: "reject",
          adminNote: reason
        });
        setNotice("Заявка на пополнение отклонена.");
      } else {
        await apiPost(`/api/admin/transactions/${item.id}/reject`, {
          reason
        });
        setNotice("Транзакция отклонена.");
      }
      await loadTopups();
    });

  const totalUsersPages = Math.max(1, Math.ceil(usersTotal / 20));
  const totalHistoryPages = Math.max(1, Math.ceil(historyTotal / 30));

  const canUseAdmin = useMemo(() => {
    if (!me) return false;
    if (!me.twoFactorRequired) return true;
    return me.twoFactorEnabled && me.twoFactorVerified;
  }, [me]);

  return (
    <div className="space-y-4">
      {notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-black">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-black">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
        <aside className="rounded-3xl border border-slate-200/70 bg-white p-3 shadow-soft">
          <div className="space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                prefetch={false}
                onClick={() => setTab(item.key)}
                className={
                  tab === item.key
                    ? "flex h-11 items-center rounded-2xl border border-[#5C5BD6] bg-[#EEF0FF] px-4 text-base font-semibold text-black"
                    : "flex h-11 items-center rounded-2xl border border-slate-200 px-4 text-base font-semibold text-black transition hover:bg-[#F7F8FF]"
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        </aside>

        <section className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-soft md:p-5">
          {tab === "users" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-4xl font-semibold text-black">Пользователи</h2>
                <p className="mt-1 text-sm text-[#5A6072]">Поиск и управление ролями.</p>
              </div>

              <div className="grid gap-2 md:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                <input
                  value={usersQuery}
                  onChange={(event) => setUsersQuery(event.target.value)}
                  placeholder="Email или ID"
                  className={textInputClass}
                />
                <select
                  value={usersRole}
                  onChange={(event) => setUsersRole(event.target.value)}
                  className={textInputClass}
                >
                  <option value="">Все роли</option>
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                </select>
                <select
                  value={usersStatus}
                  onChange={(event) => setUsersStatus(event.target.value)}
                  className={textInputClass}
                >
                  <option value="">Все статусы</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    runAction(async () => {
                      setUsersPage(1);
                      await loadUsers();
                    })
                  }
                  className={primaryButtonClass}
                  disabled={!canUseAdmin || busy}
                >
                  Применить
                </button>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#FCFDFF] text-xs uppercase tracking-[0.18em] text-[#93A9D1]">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Баланс</th>
                      <th className="px-4 py-3">Создан</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedUserId(item.id)}
                        className={`cursor-pointer border-t border-slate-100 ${
                          selectedUserId === item.id ? "bg-[#F3F5FF]" : "bg-white hover:bg-[#F8F9FF]"
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-black">{item.email || "—"}</td>
                        <td className="px-4 py-3 text-black">{item.name || "—"}</td>
                        <td className="px-4 py-3 text-black">{roleLabel(item.role)}</td>
                        <td className="px-4 py-3 text-black">
                          {Number(item.balanceCache || 0).toLocaleString("ru-RU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}{" "}
                          ₽
                        </td>
                        <td className="px-4 py-3 text-[#5A6072]">{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                    {users.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-[#5A6072]" colSpan={5}>
                          Пользователи не найдены.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-[#5A6072]">
                <span>
                  Страница {usersPage} из {totalUsersPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}
                    disabled={usersPage <= 1 || busy}
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setUsersPage((prev) => Math.min(totalUsersPages, prev + 1))}
                    disabled={usersPage >= totalUsersPages || busy}
                  >
                    Вперёд
                  </button>
                </div>
              </div>

              {selectedUserDetails ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-slate-200 bg-[#FCFDFF] p-4">
                    <div className="text-base font-semibold text-black">Управление пользователем</div>
                    <div className="mt-1 text-sm text-[#5A6072]">{selectedUserDetails.user?.email || selectedUserId}</div>
                    <div className="mt-3 grid gap-2">
                      <select
                        value={editRole}
                        onChange={(event) => setEditRole(event.target.value)}
                        className={textInputClass}
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                      </select>
                      <select
                        value={editStatus}
                        onChange={(event) => setEditStatus(event.target.value)}
                        className={textInputClass}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="BLOCKED">BLOCKED</option>
                      </select>
                      <input
                        value={editReason}
                        onChange={(event) => setEditReason(event.target.value)}
                        placeholder="Причина действия"
                        className={textInputClass}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={onChangeRole}
                          className={primaryButtonClass}
                          disabled={!canUseAdmin || busy}
                        >
                          Сменить роль
                        </button>
                        <button
                          type="button"
                          onClick={onChangeStatus}
                          className={secondaryButtonClass}
                          disabled={!canUseAdmin || busy}
                        >
                          Сменить статус
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-[#FCFDFF] p-4">
                    <div className="text-base font-semibold text-black">Изменение баланса</div>
                    <div className="mt-1 text-sm text-[#5A6072]">
                      Текущий баланс:{" "}
                      {Number(selectedUserDetails.user?.balanceCache || 0).toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}{" "}
                      ₽
                    </div>
                    <div className="mt-3 grid gap-2">
                      <input
                        value={adjustUserId}
                        onChange={(event) => setAdjustUserId(event.target.value)}
                        placeholder="userId"
                        className={textInputClass}
                      />
                      <input
                        value={adjustDelta}
                        onChange={(event) => setAdjustDelta(event.target.value)}
                        placeholder="Сумма (+/-)"
                        className={textInputClass}
                      />
                      <input
                        value={adjustReason}
                        onChange={(event) => setAdjustReason(event.target.value)}
                        placeholder="Комментарий"
                        className={textInputClass}
                      />
                      <button
                        type="button"
                        onClick={onAdjustBalance}
                        className={primaryButtonClass}
                        disabled={!canUseAdmin || busy}
                      >
                        Создать заявку
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-[#F8F9FF] px-4 py-5 text-sm text-[#5A6072]">
                  Выберите пользователя в таблице, чтобы изменить роль, статус и баланс.
                </div>
              )}
            </div>
          ) : null}

          {tab === "topups" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-4xl font-semibold text-black">Заявки на пополнение</h2>
                <p className="mt-1 text-sm text-[#5A6072]">Ручное подтверждение пополнений.</p>
              </div>

              <div className="grid gap-2 md:grid-cols-[1.4fr_0.8fr_auto]">
                <input
                  value={topupsQuery}
                  onChange={(event) => setTopupsQuery(event.target.value)}
                  placeholder="Поиск по email"
                  className={textInputClass}
                />
                <select
                  value={topupsType}
                  onChange={(event) => setTopupsType(event.target.value)}
                  className={textInputClass}
                >
                  <option value="">Все методы</option>
                  <option value="crypto">crypto</option>
                  <option value="MANUAL_DEPOSIT">manual_deposit</option>
                  <option value="ADMIN_ADJUSTMENT">admin_adjustment</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    runAction(async () => {
                      setTopupsPage(1);
                      await loadTopups();
                    })
                  }
                  className={primaryButtonClass}
                  disabled={!canUseAdmin || busy}
                >
                  Применить
                </button>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#FCFDFF] text-xs uppercase tracking-[0.18em] text-[#93A9D1]">
                    <tr>
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">Сумма</th>
                      <th className="px-4 py-3">Метод</th>
                      <th className="px-4 py-3">Статус</th>
                      <th className="px-4 py-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topups.map((tx) => (
                      <tr key={tx.id} className="border-t border-slate-100 bg-white">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-black">{tx.user?.email || tx.user?.name || tx.user?.id || "—"}</div>
                          <div className="text-xs text-[#5A6072]">{(tx.requestId || tx.id).slice(0, 10)}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-black">{formatTopupAmount(tx)}</td>
                        <td className="px-4 py-3 text-black">{tx.method}</td>
                        <td className="px-4 py-3 text-black">{statusLabel(tx.status)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            {tx.method === "crypto" ? (
                              <input
                                value={approveAmountByTx[tx.id] || ""}
                                onChange={(event) =>
                                  setApproveAmountByTx((prev) => ({ ...prev, [tx.id]: event.target.value }))
                                }
                                placeholder={Number(tx.amount || 0) > 0 ? `${tx.amount} USDT` : "Сумма USDT"}
                                className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-xs text-black outline-none focus:border-[#5C5BD6]"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => onApproveTopup(tx)}
                              className="inline-flex h-8 items-center justify-center rounded-full bg-[#23C97A] px-4 text-sm font-semibold text-black disabled:opacity-60"
                              disabled={!canUseAdmin || busy}
                            >
                              Подтвердить
                            </button>
                            <div className="flex gap-2">
                              <input
                                value={rejectReasonByTx[tx.id] || ""}
                                onChange={(event) =>
                                  setRejectReasonByTx((prev) => ({ ...prev, [tx.id]: event.target.value }))
                                }
                                placeholder="Причина"
                                className="h-8 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-black outline-none focus:border-[#5C5BD6]"
                              />
                              <button
                                type="button"
                                onClick={() => onRejectTopup(tx)}
                                className="inline-flex h-8 items-center justify-center rounded-full bg-[#FF4D73] px-4 text-sm font-semibold text-black disabled:opacity-60"
                                disabled={!canUseAdmin || busy}
                              >
                                Отклонить
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {topups.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-[#5A6072]" colSpan={5}>
                          Заявок в статусе ожидания нет.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === "transactions" ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-4xl font-semibold text-black">Транзакции</h2>
                <p className="mt-1 text-sm text-[#5A6072]">Прозрачная история операций.</p>
              </div>

              <div className="grid gap-2 md:grid-cols-[1.3fr_0.9fr_0.9fr_0.8fr_0.8fr_auto]">
                <input
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="Поиск по email"
                  className={textInputClass}
                />
                <select
                  value={historyType}
                  onChange={(event) => setHistoryType(event.target.value)}
                  className={textInputClass}
                >
                  <option value="">Все типы</option>
                  <option value="MANUAL_DEPOSIT">MANUAL_DEPOSIT</option>
                  <option value="ADMIN_ADJUSTMENT">ADMIN_ADJUSTMENT</option>
                </select>
                <select
                  value={historyStatus}
                  onChange={(event) => setHistoryStatus(event.target.value)}
                  className={textInputClass}
                >
                  <option value="">Все статусы</option>
                  <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="EXECUTED">EXECUTED</option>
                  <option value="FAILED">FAILED</option>
                </select>
                <input
                  type="date"
                  value={historyDateFrom}
                  onChange={(event) => setHistoryDateFrom(event.target.value)}
                  className={textInputClass}
                />
                <input
                  type="date"
                  value={historyDateTo}
                  onChange={(event) => setHistoryDateTo(event.target.value)}
                  className={textInputClass}
                />
                <button
                  type="button"
                  onClick={() =>
                    runAction(async () => {
                      setHistoryPage(1);
                      await loadHistory();
                    })
                  }
                  className={primaryButtonClass}
                  disabled={!canUseAdmin || busy}
                >
                  Применить
                </button>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#FCFDFF] text-xs uppercase tracking-[0.18em] text-[#93A9D1]">
                    <tr>
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">Тип</th>
                      <th className="px-4 py-3">Сумма</th>
                      <th className="px-4 py-3">Комментарий</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((tx) => (
                      <tr key={tx.id} className="border-t border-slate-100 bg-white">
                        <td className="px-4 py-3 font-semibold text-black">{tx.user?.email || tx.user?.name || tx.user?.id || "—"}</td>
                        <td className="px-4 py-3 text-black">{tx.type.toLowerCase()}</td>
                        <td className="px-4 py-3 font-semibold text-black">{formatAmount(tx.amount, tx.currency)}</td>
                        <td className="px-4 py-3 text-[#5A6072]">{tx.comment || "—"}</td>
                        <td className="px-4 py-3 text-[#5A6072]">{formatDate(tx.createdAt)}</td>
                        <td className="px-4 py-3 text-black">{statusLabel(tx.status)}</td>
                      </tr>
                    ))}
                    {historyRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-[#5A6072]" colSpan={6}>
                          Транзакции не найдены.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-[#5A6072]">
                <span>
                  Страница {historyPage} из {totalHistoryPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                    disabled={historyPage <= 1 || busy}
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))}
                    disabled={historyPage >= totalHistoryPages || busy}
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
