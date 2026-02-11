const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

const { prisma } = require("../lib/prisma.js");
const txService = require("../lib/admin/transactions.js");

const { createPendingTransaction, approvePendingTransaction, rejectPendingTransaction } = txService;

test("approve flow: pending -> executed and ledger applied", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `tx-user-${suffix}@example.com`,
      passwordHash: "hash",
      role: "USER",
      status: "ACTIVE",
      balanceCache: 0
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: `tx-admin-${suffix}@example.com`,
      passwordHash: "hash",
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  try {
    const pending = await createPendingTransaction({
      userId: user.id,
      type: "ADMIN_ADJUSTMENT",
      amount: 250,
      currency: "RUB",
      metadata: { reason: "test-credit" }
    });

    assert.equal(pending.status, "PENDING_APPROVAL");

    const executed = await approvePendingTransaction({
      transactionId: pending.id,
      actorUserId: admin.id
    });

    assert.equal(executed.status, "EXECUTED");

    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balanceCache: true }
    });
    assert.equal(Number(refreshedUser.balanceCache), 250);

    const ledgerRows = await prisma.balanceLedger.findMany({
      where: { txId: pending.id }
    });
    assert.equal(ledgerRows.length, 1);
    assert.equal(Number(ledgerRows[0].delta), 250);
  } finally {
    await prisma.balanceLedger.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } });
  }
});

test("reject flow: pending -> rejected without ledger mutation", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `tx-user-reject-${suffix}@example.com`,
      passwordHash: "hash",
      role: "USER",
      status: "ACTIVE",
      balanceCache: 0
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: `tx-admin-reject-${suffix}@example.com`,
      passwordHash: "hash",
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  try {
    const pending = await createPendingTransaction({
      userId: user.id,
      type: "CRYPTO_TOPUP",
      amount: 100,
      currency: "USDT",
      metadata: { network: "TRC20" }
    });

    const rejected = await rejectPendingTransaction({
      transactionId: pending.id,
      actorUserId: admin.id,
      reason: "tx hash mismatch"
    });

    assert.equal(rejected.status, "REJECTED");

    const ledgerRows = await prisma.balanceLedger.findMany({
      where: { txId: pending.id }
    });
    assert.equal(ledgerRows.length, 0);

    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balanceCache: true }
    });
    assert.equal(Number(refreshedUser.balanceCache), 0);
  } finally {
    await prisma.balanceLedger.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } });
  }
});

test("approve crypto topup converts USDT to RUB at fixed 80 rate", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `tx-user-crypto-${suffix}@example.com`,
      passwordHash: "hash",
      role: "USER",
      status: "ACTIVE",
      balanceCache: 0
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: `tx-admin-crypto-${suffix}@example.com`,
      passwordHash: "hash",
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  try {
    const pending = await createPendingTransaction({
      userId: user.id,
      type: "CRYPTO_TOPUP",
      amount: 100,
      currency: "USDT",
      metadata: { network: "TRC20", exchange_rate_rub_per_usdt: 80 }
    });

    const executed = await approvePendingTransaction({
      transactionId: pending.id,
      actorUserId: admin.id
    });

    assert.equal(executed.status, "EXECUTED");

    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balanceCache: true }
    });
    assert.equal(Number(refreshedUser.balanceCache), 8000);

    const ledgerRows = await prisma.balanceLedger.findMany({
      where: { txId: pending.id }
    });
    assert.equal(ledgerRows.length, 1);
    assert.equal(Number(ledgerRows[0].delta), 8000);
  } finally {
    await prisma.balanceLedger.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } });
  }
});

test("createPendingTransaction reuses existing row for same idempotency key", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `tx-user-idem-${suffix}@example.com`,
      passwordHash: "hash",
      role: "USER",
      status: "ACTIVE",
      balanceCache: 0
    }
  });

  try {
    const first = await createPendingTransaction({
      userId: user.id,
      type: "CRYPTO_TOPUP",
      amount: 100,
      currency: "USDT",
      idempotencyKey: `idem-${suffix}`,
      metadata: { amount_usdt: 100, exchange_rate_rub_per_usdt: 80 }
    });

    const second = await createPendingTransaction({
      userId: user.id,
      type: "CRYPTO_TOPUP",
      amount: 100,
      currency: "USDT",
      idempotencyKey: `idem-${suffix}`,
      metadata: { amount_usdt: 100, exchange_rate_rub_per_usdt: 80 }
    });

    assert.equal(first.id, second.id);

    const rows = await prisma.transaction.findMany({
      where: { userId: user.id, type: "CRYPTO_TOPUP" }
    });
    assert.equal(rows.length, 1);
  } finally {
    await prisma.balanceLedger.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("approvePendingTransaction is idempotent for already executed tx", async () => {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `tx-user-repeat-approve-${suffix}@example.com`,
      passwordHash: "hash",
      role: "USER",
      status: "ACTIVE",
      balanceCache: 0
    }
  });

  const admin = await prisma.user.create({
    data: {
      email: `tx-admin-repeat-approve-${suffix}@example.com`,
      passwordHash: "hash",
      role: "SUPER_ADMIN",
      status: "ACTIVE"
    }
  });

  try {
    const pending = await createPendingTransaction({
      userId: user.id,
      type: "ADMIN_ADJUSTMENT",
      amount: 900,
      currency: "RUB",
      metadata: { reason: "idempotent approve check" }
    });

    const first = await approvePendingTransaction({
      transactionId: pending.id,
      actorUserId: admin.id
    });
    const second = await approvePendingTransaction({
      transactionId: pending.id,
      actorUserId: admin.id
    });

    assert.equal(first.status, "EXECUTED");
    assert.equal(second.status, "EXECUTED");
    assert.equal(first.id, second.id);

    const userNow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { balanceCache: true }
    });
    assert.equal(Number(userNow.balanceCache), 900);

    const ledgerRows = await prisma.balanceLedger.findMany({
      where: { txId: pending.id }
    });
    assert.equal(ledgerRows.length, 1);
  } finally {
    await prisma.balanceLedger.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, admin.id] } } });
  }
});
