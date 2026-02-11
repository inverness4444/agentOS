import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import txService from "@/lib/admin/transactions.js";
import audit from "@/lib/admin/audit.js";
import guard from "@/lib/admin/guard.js";

export const runtime = "nodejs";
const CRYPTO_USDT_TO_RUB_RATE = 80;
const { requireSuperAdmin } = guard as {
  requireSuperAdmin: (
    request: Request,
    options?: { requireCsrf?: boolean; require2fa?: boolean; stepUpMinutes?: number | null }
  ) => Promise<{
    ok: boolean;
    status?: number;
    code?: string;
    message?: string;
    user?: { id: string };
    meta?: { ip?: string | null; userAgent?: string | null };
  }>;
};
const { createPendingTransaction, approvePendingTransaction, rejectPendingTransaction } = txService as {
  createPendingTransaction: (input: {
    userId: string;
    type: string;
    amount: number;
    currency?: string;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => Promise<{ id: string; userId: string }>;
  approvePendingTransaction: (input: {
    transactionId: string;
    actorUserId: string;
  }) => Promise<{ id: string; userId: string }>;
  rejectPendingTransaction: (input: {
    transactionId: string;
    actorUserId: string;
    reason: string;
  }) => Promise<{ id: string; userId: string }>;
};
const { logAdminAction } = audit as {
  logAdminAction: (input: {
    actorUserId: string;
    actionType: string;
    targetUserId?: string | null;
    targetTxId?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
  }) => Promise<unknown>;
};

const parseAmountFromNote = (note: string | null) => {
  const raw = String(note || "");
  const match =
    /amount_usdt\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /amount\s*[:=]\s*([0-9]+(?:[.,][0-9]+)?)/i.exec(raw) ||
    /([0-9]+(?:[.,][0-9]+)?)\s*usdt/i.exec(raw);
  if (!match) return 0;
  const value = Number(String(match[1]).replace(",", "."));
  return Number.isFinite(value) ? value : 0;
};

const parseMetadata = (value: unknown) => {
  if (!value) return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : (value as Record<string, unknown>);
  } catch {
    return {};
  }
};

const resolveAmountUsdt = ({
  bodyAmountUsdt,
  note,
  metadataJson
}: {
  bodyAmountUsdt: unknown;
  note: string | null;
  metadataJson?: string | null;
}) => {
  const fromBody = Number(bodyAmountUsdt);
  if (Number.isFinite(fromBody) && fromBody > 0) return Math.round(fromBody * 100) / 100;

  const fromNote = parseAmountFromNote(note);
  if (fromNote > 0) return Math.round(fromNote * 100) / 100;

  const metadata = parseMetadata(metadataJson);
  const fromMetadata = Number(
    (metadata as any).amount_usdt ?? (metadata as any).amountUsdt ?? (metadata as any).usdt_amount
  );
  if (Number.isFinite(fromMetadata) && fromMetadata > 0) {
    return Math.round(fromMetadata * 100) / 100;
  }
  return 0;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireSuperAdmin(request, {
    requireCsrf: true,
    require2fa: true,
    stepUpMinutes: 10
  });
  if (!access.ok || !access.user) {
    return NextResponse.json(
      { error: access.message || access.code || "Forbidden", code: access.code || "FORBIDDEN" },
      { status: access.status || 403 }
    );
  }
  const userId = access.user.id;

  const { id } = await context.params;
  const requestId = String(id || "").trim();
  if (!requestId) {
    return NextResponse.json({ error: "request id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action || "").trim().toLowerCase();
  const adminNote = String(body.adminNote || "").trim();

  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const target = await prisma.billingCryptoRequest.findUnique({
    where: { id: requestId }
  });

  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (target.status !== "PENDING") {
    return NextResponse.json({ error: "Request already reviewed" }, { status: 409 });
  }

  const reviewedAt = new Date();
  const nextStatus = action === "approve" ? "APPROVED" : "REJECTED";

  let transactionResult: { id: string; userId: string } | null = null;
  let createdTransactionId: string | null = null;
  if (target.transactionId) {
    if (action === "approve") {
      const currentTx = await prisma.transaction.findUnique({
        where: { id: target.transactionId },
        select: {
          id: true,
          type: true,
          amount: true,
          metadataJson: true
        }
      });

      if (currentTx?.type === "CRYPTO_TOPUP" && Number(currentTx.amount || 0) <= 0) {
        const amountUsdt = resolveAmountUsdt({
          bodyAmountUsdt: body.amountUsdt,
          note: target.note,
          metadataJson: currentTx.metadataJson
        });
        if (amountUsdt <= 0) {
          return NextResponse.json(
            {
              error:
                "В заявке не указана сумма пополнения. Укажите сумму (USDT) и отправьте новую заявку."
            },
            { status: 400 }
          );
        }

        const metadata = parseMetadata(currentTx.metadataJson);
        await prisma.transaction.update({
          where: { id: currentTx.id },
          data: {
            amount: amountUsdt,
            currency: "USDT",
            metadataJson: JSON.stringify({
              ...metadata,
              amount_usdt: amountUsdt,
              exchange_rate_rub_per_usdt: CRYPTO_USDT_TO_RUB_RATE,
              expected_rub_amount: Math.round(amountUsdt * CRYPTO_USDT_TO_RUB_RATE * 100) / 100
            })
          }
        });
      }
    }

    if (action === "approve") {
      transactionResult = await approvePendingTransaction({
        transactionId: target.transactionId,
        actorUserId: userId
      });
    } else {
      transactionResult = await rejectPendingTransaction({
        transactionId: target.transactionId,
        actorUserId: userId,
        reason: adminNote || "Отклонено администратором"
      });
    }
  } else if (action === "approve") {
    const amountUsdt = resolveAmountUsdt({
      bodyAmountUsdt: body.amountUsdt,
      note: target.note
    });
    if (amountUsdt <= 0) {
      return NextResponse.json(
        {
          error:
            "Нельзя подтвердить заявку без суммы. Укажите amount_usdt в комментарии или выполните ручную корректировку баланса."
        },
        { status: 400 }
      );
    }

    const created = await createPendingTransaction({
      userId: target.userId,
      type: "CRYPTO_TOPUP",
      amount: amountUsdt,
      currency: "USDT",
      idempotencyKey: `billing_request:${target.id}`,
      metadata: {
        amount_usdt: amountUsdt,
        exchange_rate_rub_per_usdt: CRYPTO_USDT_TO_RUB_RATE,
        expected_rub_amount: Math.round(amountUsdt * CRYPTO_USDT_TO_RUB_RATE * 100) / 100,
        network: target.network,
        walletAddress: target.walletAddress,
        txHash: target.txHash || null,
        note: target.note || null
      }
    });
    createdTransactionId = created.id;
    transactionResult = await approvePendingTransaction({
      transactionId: created.id,
      actorUserId: userId
    });
  }

  const updated = await prisma.billingCryptoRequest.update({
    where: { id: target.id },
    data: {
      status: nextStatus,
      transactionId: target.transactionId || createdTransactionId,
      adminNote: adminNote ? adminNote.slice(0, 1000) : null,
      reviewedAt,
      reviewedByUserId: userId
    }
  });

  await logAdminAction({
    actorUserId: userId,
    actionType: action === "approve" ? "BILLING_CRYPTO_REQUEST_APPROVED" : "BILLING_CRYPTO_REQUEST_REJECTED",
    targetUserId: target.userId,
    targetTxId: transactionResult?.id || target.transactionId || null,
    metadata: {
      requestId: target.id,
      action,
      reason: adminNote || null
    },
    ip: access.meta?.ip || null,
    userAgent: access.meta?.userAgent || null
  });

  return NextResponse.json({ ok: true, request: updated });
}
