import { prisma } from "@/lib/prisma";
import guard from "@/lib/admin/guard.js";
import audit from "@/lib/admin/audit.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { logAdminAction } = audit;
const { jsonNoStore, jsonGuardError } = http;

const ALLOWED_ROLES = ["USER", "ADMIN", "SUPER_ADMIN"];

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
  const role = String(body.role || "")
    .trim()
    .toUpperCase();
  const reason = String(body.reason || "").trim().slice(0, 500);

  if (!ALLOWED_ROLES.includes(role)) {
    return jsonNoStore({ error: "Invalid role" }, { status: 400 });
  }

  if (targetUserId === access.user.id) {
    return jsonNoStore({ error: "Нельзя менять свою роль." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, email: true }
  });
  if (!target) {
    return jsonNoStore({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { role }
  });

  await logAdminAction({
    actorUserId: access.user.id,
    actionType: "USER_ROLE_CHANGED",
    targetUserId,
    metadata: {
      previousRole: target.role,
      nextRole: role,
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
