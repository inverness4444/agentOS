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

const parseDateBoundary = (value, endOfDay = false) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const safeJsonParse = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const runtime = "nodejs";

export async function GET(request) {
  const access = await requireSuperAdmin(request);
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), 30), 100);
  const skip = (page - 1) * pageSize;

  const q = String(searchParams.get("q") || "").trim();
  const type = String(searchParams.get("type") || "")
    .trim()
    .toUpperCase();
  const status = String(searchParams.get("status") || "")
    .trim()
    .toUpperCase();
  const dateFrom = parseDateBoundary(searchParams.get("dateFrom"), false);
  const dateTo = parseDateBoundary(searchParams.get("dateTo"), true);

  const where = {};

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

  if (status) {
    where.status = status;
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = dateFrom;
    if (dateTo) where.createdAt.lte = dateTo;
  }

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, name: true }
        },
        approvedBy: {
          select: { id: true, email: true, name: true }
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
    transactions: items.map((item) => {
      const metadata = safeJsonParse(item.metadataJson);
      const comment = String(
        item.rejectionReason ||
          metadata?.reason ||
          metadata?.note ||
          metadata?.adminNote ||
          ""
      ).trim();
      return {
        ...item,
        amount: Number(item.amount || 0),
        metadata,
        comment: comment || null
      };
    })
  });
}
