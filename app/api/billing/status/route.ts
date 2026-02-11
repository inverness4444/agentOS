import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId } from "@/lib/server/auth";

export const runtime = "nodejs";

const SUBSCRIPTION_PERIOD_DAYS = 30;
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  }

  const [user, lastDebit, lastCancel] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true }
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

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404, headers: noStore });
  }

  let plan = String(user.plan || "").toUpperCase();
  const paidPeriodEndAt = lastDebit?.createdAt
    ? new Date(lastDebit.createdAt.getTime() + SUBSCRIPTION_PERIOD_DAYS * MS_IN_DAY)
    : null;
  const hasActivePaidPeriod = Boolean(paidPeriodEndAt && paidPeriodEndAt.getTime() > Date.now());

  if (!hasActivePaidPeriod && plan === "PRO") {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "FREE" }
    });
    plan = "FREE";
  }

  if (hasActivePaidPeriod && plan !== "PRO") {
    await prisma.user.update({
      where: { id: userId },
      data: { plan: "PRO" }
    });
    plan = "PRO";
  }

  const hasSubscription = plan === "PRO" && hasActivePaidPeriod;
  const effectiveNextPaymentAt = hasSubscription ? paidPeriodEndAt : null;
  const daysLeft =
    hasSubscription && effectiveNextPaymentAt
      ? Math.max(0, Math.ceil((effectiveNextPaymentAt.getTime() - Date.now()) / MS_IN_DAY))
      : 0;
  const cancelScheduled = Boolean(
    hasSubscription &&
      lastCancel?.createdAt &&
      lastDebit?.createdAt &&
      lastCancel.createdAt.getTime() >= lastDebit.createdAt.getTime()
  );

  return NextResponse.json(
    {
      plan,
      hasSubscription,
      cancelScheduled,
      daysLeft,
      nextPaymentAt: effectiveNextPaymentAt ? effectiveNextPaymentAt.toISOString() : null
    },
    { headers: noStore }
  );
}
