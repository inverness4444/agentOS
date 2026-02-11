import guard from "@/lib/admin/guard.js";
import security from "@/lib/admin/security.js";
import twofa from "@/lib/admin/twofa.js";
import audit from "@/lib/admin/audit.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { decryptText, set2faCookie } = security;
const { verifyTotp } = twofa;
const { logAdminAction } = audit;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function POST(request) {
  const access = await requireSuperAdmin(request, { requireCsrf: true, require2fa: false });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  if (!access.user.twoFactorEnabled || !access.user.twoFactorSecretEnc) {
    return jsonNoStore(
      { error: "2FA не настроена. Сначала выполните настройку.", code: "OTP_NOT_CONFIGURED" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  const secret = decryptText(access.user.twoFactorSecretEnc);

  if (!secret || !verifyTotp({ secret, token: code })) {
    return jsonNoStore({ error: "Неверный код 2FA.", code: "OTP_INVALID" }, { status: 400 });
  }

  await logAdminAction({
    actorUserId: access.user.id,
    actionType: "ADMIN_2FA_VERIFIED",
    metadata: { ok: true },
    ip: access.meta.ip,
    userAgent: access.meta.userAgent
  });

  const response = jsonNoStore({ ok: true });
  set2faCookie(response, access.user.id);
  return response;
}
