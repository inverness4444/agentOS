import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { jsonNoStore, jsonGuardError } = http;

const parsePositiveInt = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
};

export const runtime = "nodejs";

export async function GET(request) {
  const access = await requireSuperAdmin(request);
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 30), 200);
  const skip = (page - 1) * pageSize;
  const actionType = String(searchParams.get("actionType") || "").trim();
  const actorUserId = String(searchParams.get("actorUserId") || "").trim();
  const targetUserId = String(searchParams.get("targetUserId") || "").trim();
  const targetTxId = String(searchParams.get("targetTxId") || "").trim();

  const where = {};
  if (actionType) where.actionType = actionType;
  if (actorUserId) where.actorUserId = actorUserId;
  if (targetUserId) where.targetUserId = targetUserId;
  if (targetTxId) where.targetTxId = targetTxId;

  const [items, total] = await Promise.all([
    prisma.adminActionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        actor: { select: { id: true, email: true, name: true } },
        targetUser: { select: { id: true, email: true, name: true } },
        targetTx: { select: { id: true, type: true, amount: true, currency: true, status: true } }
      }
    }),
    prisma.adminActionLog.count({ where })
  ]);

  return jsonNoStore({
    ok: true,
    page,
    pageSize,
    total,
    logs: items.map((item) => ({
      ...item,
      targetTx: item.targetTx
        ? { ...item.targetTx, amount: Number(item.targetTx.amount || 0) }
        : null
    }))
  });
}
