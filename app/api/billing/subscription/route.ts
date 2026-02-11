import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";
import requestSecurity from "@/lib/security/request.js";

export const runtime = "nodejs";

const SUBSCRIPTION_PRICE_RUB = 5000;
const SUBSCRIPTION_PERIOD_DAYS = 30;
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const noStore = { "Cache-Control": "no-store, max-age=0" };
const { isSameOriginRequest } = requestSecurity as {
  isSameOriginRequest: (request: Request) => boolean;
};

const asDecimal = (value: number) => new Prisma.Decimal(value || 0);
const toIso = (date: Date | null) => (date ? date.toISOString() : null);

const computeSubscriptionState = ({
  plan,
  lastDebitAt,
  lastCancelAt
}: {
  plan: string;
  lastDebitAt: Date | null;
  lastCancelAt: Date | null;
}) => {
  const normalizedPlan = String(plan || "").toUpperCase();
  if (normalizedPlan !== "PRO") {
    return {
      active: false,
      daysLeft: 0,
      endAt: null as Date | null,
      cancelScheduled: false
    };
  }
  if (!lastDebitAt) {
    return {
      active: true,
      daysLeft: 0,
      endAt: null as Date | null,
      cancelScheduled: false
    };
  }

  const endAt = new Date(lastDebitAt.getTime() + SUBSCRIPTION_PERIOD_DAYS * MS_IN_DAY);
  const now = Date.now();
  const active = endAt.getTime() > now;
  const daysLeft = active ? Math.max(0, Math.ceil((endAt.getTime() - now) / MS_IN_DAY)) : 0;
  const cancelScheduled = Boolean(
    active && lastCancelAt && lastCancelAt.getTime() >= lastDebitAt.getTime()
  );

  return {
    active,
    daysLeft,
    endAt,
    cancelScheduled
  };
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403, headers: noStore });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "subscribe").toLowerCase();
  if (!["subscribe", "unsubscribe"].includes(action)) {
    return NextResponse.json({ error: "action must be subscribe|unsubscribe" }, { status: 400, headers: noStore });
  }

  const [current, lastDebit, lastCancel] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, plan: true, balanceCache: true }
    }),
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
  ]);
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers: noStore });
  }
  if (String(current.status || "").toUpperCase() === "BLOCKED") {
    return NextResponse.json({ error: "User blocked" }, { status: 403, headers: noStore });
  }

  let effectivePlan = String(current.plan || "").toUpperCase();
  const state = computeSubscriptionState({
    plan: effectivePlan,
    lastDebitAt: lastDebit?.createdAt || null,
    lastCancelAt: lastCancel?.createdAt || null
  });

  if (effectivePlan === "PRO" && lastDebit?.createdAt && !state.active) {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE" }
    });
    effectivePlan = "FREE";
  }

  if (action === "unsubscribe") {
    if (effectivePlan === "FREE") {
      return NextResponse.json(
        {
          ok: true,
          plan: "FREE",
          balance: Number(current.balanceCache || 0),
          subscription: {
            active: false,
            cancelScheduled: false,
            daysLeft: 0,
            endAt: null
          }
        },
        { headers: noStore }
      );
    }

    const nextState = computeSubscriptionState({
      plan: effectivePlan,
      lastDebitAt: lastDebit?.createdAt || null,
      lastCancelAt: lastCancel?.createdAt || null
    });

    if (!nextState.active || !nextState.endAt) {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { plan: "FREE" },
        select: { plan: true, balanceCache: true }
      });
      return NextResponse.json(
        {
          ok: true,
          plan: updated.plan,
          balance: Number(updated.balanceCache || 0),
          subscription: {
            active: false,
            cancelScheduled: false,
            daysLeft: 0,
            endAt: null
          }
        },
        { headers: noStore }
      );
    }

    if (nextState.cancelScheduled) {
      return NextResponse.json(
        {
          ok: true,
          plan: "PRO",
          balance: Number(current.balanceCache || 0),
          message: `Подписка уже запланирована к отключению через ${nextState.daysLeft} дн.`,
          subscription: {
            active: true,
            cancelScheduled: true,
            daysLeft: nextState.daysLeft,
            endAt: toIso(nextState.endAt)
          }
        },
        { headers: noStore }
      );
    }

    await prisma.transaction.create({
      data: {
        userId,
        type: "SUBSCRIPTION_CANCEL_REQUEST",
        amount: asDecimal(0),
        currency: "RUB",
        status: "EXECUTED",
        approvedAt: new Date(),
        metadataJson: JSON.stringify({
          source: "billing_page_manual",
          cancel_at: nextState.endAt.toISOString(),
          days_left: nextState.daysLeft
        })
      }
    });

    return NextResponse.json(
      {
        ok: true,
        plan: "PRO",
        balance: Number(current.balanceCache || 0),
        message: `Подписка отменится через ${nextState.daysLeft} дн. (${nextState.endAt.toLocaleDateString("ru-RU")}).`,
        subscription: {
          active: true,
          cancelScheduled: true,
          daysLeft: nextState.daysLeft,
          endAt: toIso(nextState.endAt)
        }
      },
      { headers: noStore }
    );
  }

  if (effectivePlan === "PRO") {
    const activeState = computeSubscriptionState({
      plan: effectivePlan,
      lastDebitAt: lastDebit?.createdAt || null,
      lastCancelAt: lastCancel?.createdAt || null
    });

    return NextResponse.json(
      {
        ok: true,
        plan: "PRO",
        balance: Number(current.balanceCache || 0),
        subscription: {
          active: activeState.active,
          cancelScheduled: activeState.cancelScheduled,
          daysLeft: activeState.daysLeft,
          endAt: toIso(activeState.endAt)
        }
      },
      { headers: noStore }
    );
  }

  const now = Date.now();
  const paidPeriodEndAt = lastDebit?.createdAt
    ? new Date(lastDebit.createdAt.getTime() + SUBSCRIPTION_PERIOD_DAYS * MS_IN_DAY)
    : null;
  const hasActivePaidPeriod = Boolean(paidPeriodEndAt && paidPeriodEndAt.getTime() > now);
  if (hasActivePaidPeriod && paidPeriodEndAt) {
    if (effectivePlan !== "PRO") {
      await prisma.user.update({
        where: { id: userId },
        data: { plan: "PRO" }
      });
      effectivePlan = "PRO";
    }

    const daysLeft = Math.max(0, Math.ceil((paidPeriodEndAt.getTime() - now) / MS_IN_DAY));
    const cancelScheduled = Boolean(
      lastCancel?.createdAt && lastDebit?.createdAt && lastCancel.createdAt >= lastDebit.createdAt
    );

    return NextResponse.json(
      {
        ok: true,
        plan: "PRO",
        balance: Number(current.balanceCache || 0),
        message: "Подписка уже активна в рамках оплаченного периода.",
        subscription: {
          active: true,
          cancelScheduled,
          daysLeft,
          endAt: toIso(paidPeriodEndAt)
        }
      },
      { headers: noStore }
    );
  }

  const balance = Number(current.balanceCache || 0);
  if (!Number.isFinite(balance) || balance < SUBSCRIPTION_PRICE_RUB) {
    return NextResponse.json(
      {
        error: `Недостаточно средств. Нужно ${SUBSCRIPTION_PRICE_RUB.toLocaleString("ru-RU")} ₽.`,
        code: "INSUFFICIENT_BALANCE"
      },
      { status: 400, headers: noStore }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true, balanceCache: true }
    });
    if (!fresh) {
      throw new Error("User not found");
    }
    const freshBalance = Number(fresh.balanceCache || 0);
    if (String(fresh.plan || "").toUpperCase() === "PRO") {
      return fresh;
    }

    // Protect against duplicate debits on near-simultaneous subscribe requests.
    const freshLastDebit = await tx.transaction.findFirst({
      where: {
        userId,
        type: "SUBSCRIPTION_DEBIT",
        status: "EXECUTED"
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    });
    if (freshLastDebit?.createdAt) {
      const paidUntil = new Date(
        freshLastDebit.createdAt.getTime() + SUBSCRIPTION_PERIOD_DAYS * MS_IN_DAY
      );
      if (paidUntil.getTime() > Date.now()) {
        return tx.user.update({
          where: { id: userId },
          data: { plan: "PRO" },
          select: { plan: true, balanceCache: true }
        });
      }
    }

    if (!Number.isFinite(freshBalance) || freshBalance < SUBSCRIPTION_PRICE_RUB) {
      const error = new Error("INSUFFICIENT_BALANCE");
      (error as Error & { code?: string }).code = "INSUFFICIENT_BALANCE";
      throw error;
    }

    const payment = await tx.transaction.create({
      data: {
        userId,
        type: "SUBSCRIPTION_DEBIT",
        amount: asDecimal(SUBSCRIPTION_PRICE_RUB),
        currency: "RUB",
        status: "EXECUTED",
        approvedAt: new Date(),
        metadataJson: JSON.stringify({
          source: "billing_page_manual",
          monthly_price_rub: SUBSCRIPTION_PRICE_RUB
        })
      }
    });

    await tx.balanceLedger.create({
      data: {
        userId,
        delta: asDecimal(-SUBSCRIPTION_PRICE_RUB),
        reason: "Оплата подписки",
        source: "TRANSACTION",
        txId: payment.id
      }
    });

    return tx.user.update({
      where: { id: userId },
      data: {
        plan: "PRO",
        balanceCache: { decrement: asDecimal(SUBSCRIPTION_PRICE_RUB) }
      },
      select: { plan: true, balanceCache: true }
    });
  }).catch((error) => {
    const code = String((error as { code?: string })?.code || "");
    if (code === "INSUFFICIENT_BALANCE" || String(error?.message || "") === "INSUFFICIENT_BALANCE") {
      return null;
    }
    throw error;
  });

  if (!updated) {
    return NextResponse.json(
      {
        error: `Недостаточно средств. Нужно ${SUBSCRIPTION_PRICE_RUB.toLocaleString("ru-RU")} ₽.`,
        code: "INSUFFICIENT_BALANCE"
      },
      { status: 400, headers: noStore }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      plan: updated.plan,
      balance: Number(updated.balanceCache || 0),
      subscription: {
        active: true,
        cancelScheduled: false,
        daysLeft: SUBSCRIPTION_PERIOD_DAYS,
        endAt: toIso(new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * MS_IN_DAY))
      }
    },
    { headers: noStore }
  );
}
