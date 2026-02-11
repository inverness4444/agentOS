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
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 20), 100);
  const skip = (page - 1) * pageSize;
  const q = String(searchParams.get("q") || "").trim();
  const type = String(searchParams.get("type") || "")
    .trim()
    .toUpperCase();

  const where = { status: "PENDING_APPROVAL" };
  if (q) {
    where.OR = [
      { user: { email: { contains: q } } },
      { user: { name: { contains: q } } },
      { id: { contains: q } }
    ];
  }
  if (type) {
    where.type = type;
  }

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, name: true, status: true }
        }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize
    }),
    prisma.transaction.count({ where })
  ]);

  return jsonNoStore({
    ok: true,
    page,
    pageSize,
    total,
    transactions: items.map((item) => ({
      ...item,
      amount: Number(item.amount || 0)
    }))
  });
}
