#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { prisma } = require("../lib/prisma.js");
const allowlist = require("../lib/admin/allowlist.js");

const sqlitePath = process.env.LEGACY_SQLITE_PATH
  ? path.resolve(process.cwd(), process.env.LEGACY_SQLITE_PATH)
  : path.resolve(process.cwd(), "dev.db");

const query =
  'select id,email,passwordHash,role,status,plan,balanceCache,advancedMode,twoFactorEnabled,twoFactorSecretEnc,createdAt,updatedAt,name,image,emailVerified from "User";';

const toDate = (value) => {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) return new Date(asNumber);
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeDecimal = (value) => {
  if (value == null || value === "") return "0";
  return String(value);
};

const run = async () => {
  let rows = [];
  try {
    const output = execFileSync("sqlite3", ["-json", sqlitePath, query], {
      encoding: "utf8"
    });
    rows = JSON.parse(output || "[]");
  } catch (error) {
    console.error("[db:import-users] cannot read sqlite users:", error?.message || error);
    process.exit(1);
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("[db:import-users] no users found in legacy sqlite db.");
    process.exit(0);
  }

  let imported = 0;
  for (const row of rows) {
    const email = String(row.email || "").toLowerCase().trim();
    if (!email || !row.passwordHash) continue;

    const allowlisted = allowlist.isAllowlistedSuperAdminEmail(email);
    const role = allowlisted ? "SUPER_ADMIN" : String(row.role || "USER").toUpperCase();
    const status = allowlisted ? "ACTIVE" : String(row.status || "ACTIVE").toUpperCase();

    await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash: String(row.passwordHash),
        role,
        status,
        plan: String(row.plan || "FREE").toUpperCase(),
        balanceCache: normalizeDecimal(row.balanceCache),
        advancedMode: Boolean(row.advancedMode),
        twoFactorEnabled: Boolean(row.twoFactorEnabled),
        twoFactorSecretEnc: row.twoFactorSecretEnc || null,
        name: row.name || null,
        image: row.image || null,
        emailVerified: toDate(row.emailVerified),
        updatedAt: toDate(row.updatedAt) || new Date()
      },
      create: {
        id: String(row.id || undefined),
        email,
        passwordHash: String(row.passwordHash),
        role,
        status,
        plan: String(row.plan || "FREE").toUpperCase(),
        balanceCache: normalizeDecimal(row.balanceCache),
        advancedMode: Boolean(row.advancedMode),
        twoFactorEnabled: Boolean(row.twoFactorEnabled),
        twoFactorSecretEnc: row.twoFactorSecretEnc || null,
        name: row.name || null,
        image: row.image || null,
        emailVerified: toDate(row.emailVerified),
        createdAt: toDate(row.createdAt) || new Date(),
        updatedAt: toDate(row.updatedAt) || new Date()
      }
    });
    imported += 1;
  }

  const total = await prisma.user.count();
  const superAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
  console.log(`[db:import-users] imported=${imported} total=${total} super_admins=${superAdmins}`);
};

run()
  .catch((error) => {
    console.error("[db:import-users] failed:", error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
