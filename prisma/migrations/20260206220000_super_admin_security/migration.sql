-- Super Admin security + transaction approval
PRAGMA foreign_keys=OFF;

-- User hardening
ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN "balanceCache" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "twoFactorSecretEnc" TEXT;

-- Transactions
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "metadata_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "approved_by_user_id" TEXT,
    "approved_at" DATETIME,
    "rejection_reason" TEXT,
    CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");
CREATE INDEX "transactions_status_idx" ON "transactions"("status");
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");
CREATE INDEX "transactions_approved_by_user_id_idx" ON "transactions"("approved_by_user_id");

-- Ledger
CREATE TABLE "balance_ledger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "delta" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'OTHER',
    "tx_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "balance_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "balance_ledger_tx_id_fkey" FOREIGN KEY ("tx_id") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "balance_ledger_user_id_idx" ON "balance_ledger"("user_id");
CREATE INDEX "balance_ledger_tx_id_idx" ON "balance_ledger"("tx_id");
CREATE INDEX "balance_ledger_created_at_idx" ON "balance_ledger"("created_at");

-- Admin audit
CREATE TABLE "admin_action_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor_user_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_user_id" TEXT,
    "target_tx_id" TEXT,
    "metadata_json" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_action_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "admin_action_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "admin_action_logs_target_tx_id_fkey" FOREIGN KEY ("target_tx_id") REFERENCES "transactions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "admin_action_logs_actor_user_id_idx" ON "admin_action_logs"("actor_user_id");
CREATE INDEX "admin_action_logs_target_user_id_idx" ON "admin_action_logs"("target_user_id");
CREATE INDEX "admin_action_logs_target_tx_id_idx" ON "admin_action_logs"("target_tx_id");
CREATE INDEX "admin_action_logs_created_at_idx" ON "admin_action_logs"("created_at");

-- Link crypto requests -> transaction
ALTER TABLE "billing_crypto_requests" ADD COLUMN "transaction_id" TEXT;
CREATE UNIQUE INDEX "billing_crypto_requests_transaction_id_key" ON "billing_crypto_requests"("transaction_id");

PRAGMA foreign_keys=ON;
