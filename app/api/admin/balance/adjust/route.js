import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import audit from "@/lib/admin/audit.js";
import txService from "@/lib/admin/transactions.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { logAdminAction } = audit;
const { createPendingTransaction } = txService;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function POST(request) {
  const access = await requireSuperAdmin(request, {
    requireCsrf: true,
    require2fa: true,
    stepUpMinutes: 10
  });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const body = await request.json().catch(() => ({}));
  const userId = String(body.userId || "").trim();
  const delta = Number(body.delta);
  const reason = String(body.reason || "").trim().slice(0, 500);
  const currency = String(body.currency || "RUB")
    .trim()
    .toUpperCase()
    .slice(0, 12);
  const idempotencyKey = String(
    body.idempotencyKey || request.headers.get("idempotency-key") || ""
  )
    .trim()
    .slice(0, 120);

  if (!userId) {
    return jsonNoStore({ error: "userId required" }, { status: 400 });
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return jsonNoStore({ error: "delta must be non-zero number" }, { status: 400 });
  }
  if (!reason) {
    return jsonNoStore({ error: "reason required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true }
  });
  if (!targetUser) {
    return jsonNoStore({ error: "User not found" }, { status: 404 });
  }

  const transaction = await createPendingTransaction({
    userId,
    type: "ADMIN_ADJUSTMENT",
    amount: delta,
    currency,
    idempotencyKey: idempotencyKey || null,
    metadata: {
      reason,
      createdByUserId: access.user.id,
      createdByEmail: access.user.email || null
    }
  });

  await logAdminAction({
    actorUserId: access.user.id,
    actionType: "BALANCE_ADJUSTMENT_REQUESTED",
    targetUserId: userId,
    targetTxId: transaction.id,
    metadata: { delta, reason, currency },
    ip: access.meta.ip,
    userAgent: access.meta.userAgent
  });

  return jsonNoStore({
    ok: true,
    transaction: {
      ...transaction,
      amount: Number(transaction.amount || 0)
    }
  });
}
