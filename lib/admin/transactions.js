const { Prisma } = require("@prisma/client");
const { prisma } = require("../prisma.js");

const CRYPTO_USDT_TO_RUB_RATE = 80;

const asDecimal = (value) => new Prisma.Decimal(value || 0);
const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const parseMetadata = (value) => {
  if (!value) return {};
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return {};
  }
};

const serializeMetadata = (value) => {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ warning: "metadata_serialization_failed" });
  }
};

const normalizeIdempotencyKey = (value) => {
  const key = String(value || "").trim();
  if (!key) return null;
  return key.slice(0, 120);
};

const determineLedgerDelta = (transaction) => {
  const amount = Number(transaction.amount || 0);
  const metadata = parseMetadata(transaction.metadataJson);

  if (transaction.type === "SUBSCRIPTION_DEBIT") {
    return -Math.abs(amount);
  }
  if (transaction.type === "ADMIN_ADJUSTMENT") {
    return amount;
  }
  if (transaction.type === "CRYPTO_TOPUP") {
    const explicit = Number(metadata.delta);
    if (Number.isFinite(explicit) && explicit !== 0) {
      return roundMoney(explicit);
    }

    const currency = String(transaction.currency || "RUB").toUpperCase();
    if (currency === "USDT" || currency === "USD") {
      const rateRaw = Number(
        metadata.exchange_rate_rub_per_usdt || metadata.exchangeRateRubPerUsdt || CRYPTO_USDT_TO_RUB_RATE
      );
      const rate = Number.isFinite(rateRaw) && rateRaw > 0 ? rateRaw : CRYPTO_USDT_TO_RUB_RATE;
      return roundMoney(amount * rate);
    }

    return roundMoney(amount);
  }

  const generic = Number(metadata.delta || amount);
  return Number.isFinite(generic) ? roundMoney(generic) : 0;
};

const createPendingTransaction = async ({
  userId,
  type,
  amount,
  currency = "RUB",
  metadata = null,
  idempotencyKey = null
}) => {
  const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
  const metadataPayload =
    metadata && typeof metadata === "object" ? { ...metadata } : metadata ? { raw: metadata } : {};
  if (normalizedIdempotencyKey) {
    metadataPayload.idempotency_key = normalizedIdempotencyKey;
    const existing = await prisma.transaction.findFirst({
      where: {
        userId: String(userId),
        type: String(type),
        status: { in: ["PENDING_APPROVAL", "APPROVED", "EXECUTED"] },
        metadataJson: { contains: `"idempotency_key":"${normalizedIdempotencyKey}"` }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) {
      return existing;
    }
  }

  return prisma.transaction.create({
    data: {
      userId: String(userId),
      type,
      amount: asDecimal(amount),
      currency: String(currency || "RUB").toUpperCase(),
      status: "PENDING_APPROVAL",
      metadataJson: serializeMetadata(metadataPayload)
    }
  });
};

const approvePendingTransaction = async ({ transactionId, actorUserId }) => {
  const txId = String(transactionId || "").trim();
  const adminId = String(actorUserId || "").trim();
  if (!txId || !adminId) {
    const error = new Error("transactionId and actorUserId required");
    error.code = "BAD_INPUT";
    throw error;
  }

  try {
    return await prisma.$transaction(async (db) => {
      const current = await db.transaction.findUnique({
        where: { id: txId }
      });
      if (!current) {
        const error = new Error("Transaction not found");
        error.code = "NOT_FOUND";
        throw error;
      }
      if (String(current.status) === "EXECUTED") {
        return current;
      }
      if (String(current.status) !== "PENDING_APPROVAL") {
        const error = new Error("Transaction is not pending");
        error.code = "INVALID_STATUS";
        throw error;
      }

      const approvedAt = new Date();
      const approved = await db.transaction.update({
        where: { id: txId },
        data: {
          status: "APPROVED",
          approvedByUserId: adminId,
          approvedAt
        }
      });

      const delta = determineLedgerDelta(approved);
      if (Number.isFinite(delta) && delta !== 0) {
        await db.balanceLedger.create({
          data: {
            userId: approved.userId,
            delta: asDecimal(delta),
            reason:
              approved.type === "ADMIN_ADJUSTMENT"
                ? "Корректировка баланса администратором"
                : approved.type === "CRYPTO_TOPUP"
                  ? "Подтверждено пополнение по криптовалюте"
                  : approved.type === "SUBSCRIPTION_DEBIT"
                    ? "Списание подписки"
                    : "Исполнение транзакции",
            source: approved.type === "ADMIN_ADJUSTMENT" ? "ADMIN_ADJUSTMENT" : "TRANSACTION",
            txId: approved.id
          }
        });

        await db.user.update({
          where: { id: approved.userId },
          data: {
            balanceCache: {
              increment: asDecimal(delta)
            }
          }
        });
      }

      const executed = await db.transaction.update({
        where: { id: txId },
        data: {
          status: "EXECUTED"
        }
      });

      return executed;
    });
  } catch (error) {
    const safeMessage = String(error?.message || "Execution failed").slice(0, 1000);
    await prisma.transaction
      .updateMany({
        where: { id: txId, status: "PENDING_APPROVAL" },
        data: {
          status: "FAILED",
          rejectionReason: safeMessage
        }
      })
      .catch(() => null);
    throw error;
  }
};

const rejectPendingTransaction = async ({ transactionId, actorUserId, reason }) => {
  const txId = String(transactionId || "").trim();
  const adminId = String(actorUserId || "").trim();
  const rejectionReason = String(reason || "").trim().slice(0, 1000);
  if (!txId || !adminId) {
    const error = new Error("transactionId and actorUserId required");
    error.code = "BAD_INPUT";
    throw error;
  }
  if (!rejectionReason) {
    const error = new Error("rejection reason required");
    error.code = "BAD_INPUT";
    throw error;
  }

  const current = await prisma.transaction.findUnique({
    where: { id: txId }
  });
  if (!current) {
    const error = new Error("Transaction not found");
    error.code = "NOT_FOUND";
    throw error;
  }
  if (String(current.status) === "REJECTED") {
    return current;
  }
  if (String(current.status) !== "PENDING_APPROVAL") {
    const error = new Error("Transaction is not pending");
    error.code = "INVALID_STATUS";
    throw error;
  }

  return prisma.transaction.update({
    where: { id: txId },
    data: {
      status: "REJECTED",
      approvedByUserId: adminId,
      approvedAt: new Date(),
      rejectionReason
    }
  });
};

module.exports = {
  createPendingTransaction,
  approvePendingTransaction,
  rejectPendingTransaction,
  determineLedgerDelta
};
