import guard from "@/lib/admin/guard.js";
import security from "@/lib/admin/security.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { isTwoFactorEnforced } = guard;
const { hasValid2faCookie } = security;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function GET(request) {
  const access = await requireSuperAdmin(request, { require2fa: false });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  return jsonNoStore({
    ok: true,
    user: {
      id: access.user.id,
      email: access.user.email || null,
      role: access.user.role,
      status: access.user.status,
      twoFactorEnabled: Boolean(access.user.twoFactorEnabled),
      twoFactorRequired: isTwoFactorEnforced(),
      twoFactorVerified: Boolean(
        access.user.twoFactorEnabled ? await hasValid2faCookie(access.user.id) : true
      )
    }
  });
}
