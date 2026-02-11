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
  const q = String(searchParams.get("q") || "").trim();
  const role = String(searchParams.get("role") || "").trim().toUpperCase();
  const status = String(searchParams.get("status") || "").trim().toUpperCase();
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const skip = (page - 1) * pageSize;

  const where = {};
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { name: { contains: q } }
    ];
  }
  if (["USER", "ADMIN", "SUPER_ADMIN"].includes(role)) {
    where.role = role;
  }
  if (["ACTIVE", "BLOCKED"].includes(status)) {
    where.status = status;
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        plan: true,
        balanceCache: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.user.count({ where })
  ]);

  return jsonNoStore({
    ok: true,
    page,
    pageSize,
    total,
    users: items.map((item) => ({
      ...item,
      balanceCache: Number(item.balanceCache || 0)
    }))
  });
}
