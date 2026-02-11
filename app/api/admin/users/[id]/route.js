import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function GET(request, context) {
  const access = await requireSuperAdmin(request);
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const params = await context.params;
  const userId = String(params?.id || "").trim();
  if (!userId) {
    return jsonNoStore({ error: "User id required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      plan: true,
      balanceCache: true,
      createdAt: true,
      updatedAt: true,
      twoFactorEnabled: true
    }
  });

  if (!user) {
    return jsonNoStore({ error: "User not found" }, { status: 404 });
  }

  const [transactions, ledgers, auditLogs] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.balanceLedger.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.adminActionLog.findMany({
      where: {
        OR: [{ targetUserId: userId }, { actorUserId: userId }]
      },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  return jsonNoStore({
    ok: true,
    user: {
      ...user,
      balanceCache: Number(user.balanceCache || 0)
    },
    recentTransactions: transactions.map((item) => ({
      ...item,
      amount: Number(item.amount || 0)
    })),
    recentLedger: ledgers.map((item) => ({
      ...item,
      delta: Number(item.delta || 0)
    })),
    recentAudit: auditLogs
  });
}
