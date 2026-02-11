import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import audit from "@/lib/admin/audit.js";
import txService from "@/lib/admin/transactions.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { logAdminAction } = audit;
const { approvePendingTransaction } = txService;
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

  let approved;
  try {
    approved = await approvePendingTransaction({
      transactionId: txId,
      actorUserId: access.user.id
    });
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "NOT_FOUND") {
      return jsonNoStore({ error: "Transaction not found" }, { status: 404 });
    }
    if (code === "INVALID_STATUS") {
      return jsonNoStore({ error: "Transaction is not pending" }, { status: 409 });
    }
    return jsonNoStore({ error: "Failed to approve transaction" }, { status: 500 });
  }

  await prisma.billingCryptoRequest
    .updateMany({
      where: { transactionId: txId },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByUserId: access.user.id
      }
    })
    .catch(() => null);

  await logAdminAction({
    actorUserId: access.user.id,
    actionType: "TRANSACTION_APPROVED",
    targetUserId: approved.userId,
    targetTxId: approved.id,
    metadata: { type: approved.type, amount: Number(approved.amount || 0), currency: approved.currency },
    ip: access.meta.ip,
    userAgent: access.meta.userAgent
  });

  return jsonNoStore({
    ok: true,
    transaction: {
      ...approved,
      amount: Number(approved.amount || 0)
    }
  });
}
