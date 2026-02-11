import { getServerSession } from "next-auth";
import CryptoRequestsPanel from "@/components/billing/CryptoRequestsPanel";
import SubscriptionToggleButton from "@/components/billing/SubscriptionToggleButton";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const SUBSCRIPTION_PERIOD_DAYS = 30;

const formatDayWord = (days: number) => {
  const value = Math.abs(days) % 100;
  const mod = value % 10;
  if (value > 10 && value < 20) return "дней";
  if (mod > 1 && mod < 5) return "дня";
  if (mod === 1) return "день";
  return "дней";
};

const buildOperationRow = (entry: any) => {
  const amount = Number(entry.delta || 0);
  const txType = String(entry?.transaction?.type || "");
  const reason = String(entry.reason || "Операция по балансу");
  const isSubscriptionDebit = txType === "SUBSCRIPTION_DEBIT" || (/подписк/i.test(reason) && amount < 0);
  const isSubscriptionRefund =
    txType === "SUBSCRIPTION_REFUND" || (/возврат/i.test(reason) && /подписк/i.test(reason) && amount > 0);

  if (isSubscriptionDebit) {
    return {
      id: entry.id,
      title: "Оплата подписки",
      description: reason || "Ежемесячный платеж за доступ к системе",
      amount,
      currency: "RUB",
      occurredAt: entry.createdAt.toISOString()
    };
  }

  if (isSubscriptionRefund) {
    return {
      id: entry.id,
      title: "Возврат по подписке",
      description: reason || "Корректировка подписки",
      amount,
      currency: "RUB",
      occurredAt: entry.createdAt.toISOString()
    };
  }

  return {
    id: entry.id,
    title: amount >= 0 ? "Пополнение баланса" : "Списание с баланса",
    description: reason,
    amount,
    currency: "RUB",
    occurredAt: entry.createdAt.toISOString()
  };
};

const toRequestDto = (request: any) => ({
  id: request.id,
  transactionId: request.transactionId || null,
  network: request.network,
  walletAddress: request.walletAddress,
  status: request.status,
  txHash: request.txHash || null,
  note: request.note || null,
  adminNote: request.adminNote || null,
  createdAt:
    request.createdAt instanceof Date
      ? request.createdAt.toISOString()
      : String(request.createdAt || ""),
  reviewedAt:
    request.reviewedAt instanceof Date
      ? request.reviewedAt.toISOString()
      : request.reviewedAt
        ? String(request.reviewedAt)
        : null,
  user: request.user
    ? {
        id: request.user.id,
        email: request.user.email ?? null,
        name: request.user.name ?? null
      }
    : undefined,
  transaction: request.transaction
    ? {
        id: request.transaction.id,
        amount: Number(request.transaction.amount || 0),
        currency: String(request.transaction.currency || "RUB"),
        status: request.transaction.status,
        metadataJson: request.transaction.metadataJson || null
      }
    : undefined
});

export default async function BillingPage() {
  const subscriptionPrice = "5 000 ₽/мес";
  const subscriptionPriceRub = 5000;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "";
  const currentUser = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, plan: true, balanceCache: true }
      })
    : null;
  const currentBalance = Number(currentUser?.balanceCache || 0);
  const role = String(currentUser?.role || session?.user?.role || "").toUpperCase();
  const isAdmin = role === "SUPER_ADMIN";
  const [lastSubscriptionDebit, lastCancelRequest] = userId
    ? await Promise.all([
        prisma.transaction.findFirst({
          where: {
            userId,
            type: "SUBSCRIPTION_DEBIT",
            status: "EXECUTED"
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        }),
        prisma.transaction.findFirst({
          where: {
            userId,
            type: "SUBSCRIPTION_CANCEL_REQUEST",
            status: "EXECUTED"
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        })
      ])
    : [null, null];

  const normalizedPlan = String(currentUser?.plan || "").toUpperCase();
  const paidPeriodEndAt = lastSubscriptionDebit?.createdAt
    ? new Date(lastSubscriptionDebit.createdAt.getTime() + SUBSCRIPTION_PERIOD_DAYS * MS_IN_DAY)
    : null;
  const hasActivePaidPeriod = Boolean(paidPeriodEndAt && paidPeriodEndAt.getTime() > Date.now());
  const shouldExpireNow =
    normalizedPlan === "PRO" &&
    Boolean(lastSubscriptionDebit?.createdAt) &&
    !hasActivePaidPeriod;

  if (userId && shouldExpireNow) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE" }
    });
  }

  if (userId && hasActivePaidPeriod && normalizedPlan !== "PRO") {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "PRO" }
    });
  }

  const effectivePlan =
    hasActivePaidPeriod ? "PRO" : shouldExpireNow ? "FREE" : normalizedPlan;
  const nextPaymentDate =
    effectivePlan === "PRO" && lastSubscriptionDebit?.createdAt ? paidPeriodEndAt : null;
  const hasSubscription = effectivePlan === "PRO" && (!nextPaymentDate || nextPaymentDate.getTime() > Date.now());
  const daysToNextPayment =
    hasSubscription && nextPaymentDate
      ? Math.max(0, Math.ceil((nextPaymentDate.getTime() - Date.now()) / MS_IN_DAY))
      : null;
  const cancelScheduled =
    hasSubscription &&
    Boolean(
      lastCancelRequest?.createdAt &&
        lastSubscriptionDebit?.createdAt &&
        lastCancelRequest.createdAt.getTime() >= lastSubscriptionDebit.createdAt.getTime()
    );

  const [userRequestsRaw, pendingRequestsRaw] = userId
    ? await Promise.all([
        prisma.billingCryptoRequest.findMany({
          where: { userId },
          include: {
            transaction: {
              select: { id: true, amount: true, currency: true, status: true, metadataJson: true }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 30
        }),
        isAdmin
          ? prisma.billingCryptoRequest.findMany({
            where: { status: "PENDING" },
              include: {
                user: { select: { id: true, email: true, name: true } },
                transaction: {
                  select: { id: true, amount: true, currency: true, status: true, metadataJson: true }
                }
              },
              orderBy: { createdAt: "desc" },
              take: 100
            })
          : Promise.resolve([])
      ])
    : [[], []];

  const userRequests = userRequestsRaw.map(toRequestDto);
  const pendingRequests = pendingRequestsRaw.map(toRequestDto);
  const operations = userId
    ? await prisma.balanceLedger.findMany({
        where: { userId },
        include: {
          transaction: {
            select: {
              type: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 50
      })
    : [];

  const operationRows = operations
    .map(buildOperationRow)
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
    .slice(0, 50);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Биллинг</div>
        <h1 className="mt-2 text-2xl font-semibold text-black">Биллинг и места</h1>
        <p className="mt-2 text-sm text-[#5A6072]">Управление местами и платежами.</p>
        <div className="mt-2 text-xs text-[#5A6072]">ИНН 771377620451</div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-black">Подписка</div>
            <div className="text-sm text-[#5A6072]">Стоимость подписки</div>
            <div className="mt-1 text-sm font-semibold text-black">
              {subscriptionPrice}
            </div>
          </div>
          <SubscriptionToggleButton
            hasSubscription={hasSubscription}
            cancelScheduled={cancelScheduled}
            daysLeft={daysToNextPayment}
            currentBalance={currentBalance}
            priceRub={subscriptionPriceRub}
          />
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200/70 bg-[#F8F9FF] px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-3">
              <div>
                <div className="text-[13px] font-semibold text-black">Статус подписки</div>
                <div className="text-sm text-[#5A6072]">
                  {hasSubscription ? "Подписка активна" : "Подписки нет"}
                </div>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-black">
                  {hasSubscription
                    ? cancelScheduled
                      ? "Отключение подписки"
                      : "Следующий платёж"
                    : "Функции недоступны"}
                </div>
                <div className="text-sm text-[#5A6072]">
                  {hasSubscription
                    ? cancelScheduled
                      ? `Подписка отключится через ${daysToNextPayment ?? 0} ${formatDayWord(
                          daysToNextPayment ?? 0
                        )}.`
                      : nextPaymentDate
                        ? nextPaymentDate.toLocaleDateString("ru-RU")
                        : "—"
                    : "Оплатите подписку, чтобы открыть доступ."}
                </div>
              </div>
            </div>
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full border-4 bg-white text-center text-xs font-semibold text-black ${
                hasSubscription ? "border-emerald-400" : "border-slate-300"
              }`}
            >
              {hasSubscription ? (
                <>
                  {daysToNextPayment ?? 0}
                  <br />
                  {formatDayWord(daysToNextPayment ?? 0)}
                </>
              ) : (
                "Нет"
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-slate-200/70 bg-[#F8F9FF] px-5 py-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[#7C7CF6]">Баланс</div>
            <div className="mt-2 text-xl font-semibold text-black">
              {currentBalance.toLocaleString("ru-RU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })} ₽
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              defaultValue="100"
              className="h-11 w-24 rounded-2xl border border-slate-200/70 bg-white px-4 text-sm text-black"
            />
            <a
              href="/billing/topup"
              className="flex h-11 items-center rounded-2xl border border-[#D8DDF7] bg-white px-5 text-sm font-semibold text-black"
            >
              Пополнить
            </a>
          </div>
        </div>
      </div>

      <CryptoRequestsPanel
        isAdmin={isAdmin}
        initialOperations={operationRows}
        initialUserRequests={userRequests}
        initialPendingRequests={pendingRequests}
      />
    </div>
  );
}
