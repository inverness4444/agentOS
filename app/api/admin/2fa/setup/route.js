import guard from "@/lib/admin/guard.js";
import security from "@/lib/admin/security.js";
import twofa from "@/lib/admin/twofa.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { encryptText } = security;
const { generateTotpSecret, buildOtpAuthUrl, buildQrDataUrl } = twofa;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function GET(request) {
  const access = await requireSuperAdmin(request, { require2fa: false });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl({
    email: access.user.email || `superadmin-${access.user.id}@agentos.local`,
    secret
  });
  const qrDataUrl = await buildQrDataUrl(otpauthUrl);
  const provisioningToken = encryptText(secret);

  return jsonNoStore({
    ok: true,
    setup: {
      otpauthUrl,
      qrDataUrl,
      provisioningToken
    }
  });
}
