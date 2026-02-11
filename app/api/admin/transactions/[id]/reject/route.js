import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import audit from "@/lib/admin/audit.js";
import txService from "@/lib/admin/transactions.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { logAdminAction } = audit;
const { rejectPendingTransaction } = txService;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function POST(request, context) {
  const access = await requireSuperAdmin(request, {
    requireCsrf: true,
    require2fa: true,
    stepUpMinutes: 10
  });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const params = await context.params;
  const txId = String(params?.id || "").trim();
  if (!txId) {
    return jsonNoStore({ error: "Transaction id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || "").trim().slice(0, 1000);
  if (!reason) {
    return jsonNoStore({ error: "reason required" }, { status: 400 });
  }

  let rejected;
  try {
    rejected = await rejectPendingTransaction({
      transactionId: txId,
      actorUserId: access.user.id,
      reason
    });
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "NOT_FOUND") {
      return jsonNoStore({ error: "Transaction not found" }, { status: 404 });
    }
    if (code === "INVALID_STATUS") {
      return jsonNoStore({ error: "Transaction is not pending" }, { status: 409 });
    }
    if (code === "BAD_INPUT") {
      return jsonNoStore({ error: String(error?.message || "Invalid input") }, { status: 400 });
    }
    return jsonNoStore({ error: "Failed to reject transaction" }, { status: 500 });
  }

  await prisma.billingCryptoRequest
    .updateMany({
      where: { transactionId: txId },
      data: {
        status: "REJECTED",
        adminNote: reason,
        reviewedAt: new Date(),
        reviewedByUserId: access.user.id
      }
    })
    .catch(() => null);

  await logAdminAction({
    actorUserId: access.user.id,
    actionType: "TRANSACTION_REJECTED",
    targetUserId: rejected.userId,
    targetTxId: rejected.id,
    metadata: { reason, type: rejected.type, amount: Number(rejected.amount || 0), currency: rejected.currency },
    ip: access.meta.ip,
    userAgent: access.meta.userAgent
  });

  return jsonNoStore({
    ok: true,
    transaction: {
      ...rejected,
      amount: Number(rejected.amount || 0)
    }
  });
}
