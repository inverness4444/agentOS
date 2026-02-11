import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "no-store, max-age=0"
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

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  const entries = await prisma.balanceLedger.findMany({
    where: { userId },
    include: {
      transaction: {
        select: {
          type: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  const operations = entries.map(buildOperationRow);

  return NextResponse.json({ operations }, { headers: noStore });
}
