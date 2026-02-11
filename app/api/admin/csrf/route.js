import guard from "@/lib/admin/guard.js";
import security from "@/lib/admin/security.js";
import http from "@/lib/admin/http.js";

const { requireSuperAdmin } = guard;
const { issueCsrfToken } = security;
const { jsonNoStore, jsonGuardError } = http;

export const runtime = "nodejs";

export async function GET(request) {
  const access = await requireSuperAdmin(request, { require2fa: false });
  if (!access.ok) {
    return jsonGuardError(access);
  }

  const response = jsonNoStore({ ok: true });
  const token = issueCsrfToken(response);
  response.headers.set("x-csrf-token", token);
  return response;
}
