import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import audit from "@/lib/admin/audit.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { logAdminAction } = audit;
const { jsonNoStore, jsonGuardError } = http;

const ALLOWED_STATUS = ["ACTIVE", "BLOCKED"];

export const runtime = "nodejs";

export async function POST(request, context) {
  const access = await requireSuperAdmin(request, {
    requireCsrf: true,
    require2fa: true,
    stepUpMinutes: 15
  });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const params = await context.params;
  const targetUserId = String(params?.id || "").trim();
  if (!targetUserId) {
    return jsonNoStore({ error: "User id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "")
    .trim()
    .toUpperCase();
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!ALLOWED_STATUS.includes(status)) {
    return jsonNoStore({ error: "Invalid status" }, { status: 400 });
  }

  if (targetUserId === access.user.id && status === "BLOCKED") {
    return jsonNoStore({ error: "Нельзя заблокировать себя." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, status: true, email: true }
  });
  if (!target) {
    return jsonNoStore({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { status }
  });

  await logAdminAction({
    actorUserId: access.user.id,
    actionType: status === "BLOCKED" ? "USER_BLOCKED" : "USER_UNBLOCKED",
    targetUserId,
    metadata: {
      previousStatus: target.status,
      nextStatus: status,
      reason
    },
    ip: access.meta.ip,
    userAgent: access.meta.userAgent
  });

  return jsonNoStore({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status
    }
  });
}
