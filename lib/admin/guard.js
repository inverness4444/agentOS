const { getServerSession } = require("next-auth");
const { prisma } = require("../prisma.js");
const { authOptions } = require("../auth");
const {
  checkAdminRateLimit,
  validateCsrf,
  hasValid2faCookie,
  validateSameOrigin
} = require("./security.js");
const { requireSuperAdminCore } = require("./guardCore.js");
const { getClientIp } = require("../security/request.js");

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0"
};

const isTwoFactorEnforced = () => {
  const raw = String(process.env.ADMIN_REQUIRE_2FA ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

const getRequestMeta = (request) => {
  const ip = getClientIp(request);
  const userAgent = String(request.headers.get("user-agent") || "");
  return { ip: ip || null, userAgent: userAgent || null };
};

const requireSuperAdmin = async (request, options = {}) => {
  const { requireCsrf = false, require2fa = true, stepUpMinutes = null } = options;
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id || "";
  if (!sessionUserId) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Unauthorized" };
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUserId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      twoFactorEnabled: true
    }
  });

  if (!user) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Unauthorized" };
  }

  const base = requireSuperAdminCore({ role: user.role, status: user.status });
  if (!base.ok) {
    return { ok: false, status: base.status, code: base.code, message: base.code };
  }

  const meta = getRequestMeta(request);
  const rate = checkAdminRateLimit(`${user.id}:${meta.ip || "local"}`);
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message: "Too many requests. Retry later."
    };
  }

  if (requireCsrf && !validateSameOrigin(request)) {
    return { ok: false, status: 403, code: "ORIGIN_INVALID", message: "Invalid request origin" };
  }

  if (requireCsrf && !(await validateCsrf(request))) {
    return { ok: false, status: 403, code: "CSRF_INVALID", message: "Invalid CSRF token" };
  }

  if (require2fa && isTwoFactorEnforced()) {
    if (!user.twoFactorEnabled) {
      return { ok: false, status: 403, code: "TWO_FA_SETUP_REQUIRED", message: "2FA setup required" };
    }
    const pass2fa = await hasValid2faCookie(user.id, {
      maxAgeMs:
        Number.isFinite(Number(stepUpMinutes)) && Number(stepUpMinutes) > 0
          ? Number(stepUpMinutes) * 60 * 1000
          : undefined
    });
    if (!pass2fa) {
      if (Number.isFinite(Number(stepUpMinutes)) && Number(stepUpMinutes) > 0) {
        return {
          ok: false,
          status: 401,
          code: "TWO_FA_STEP_UP_REQUIRED",
          message: "2FA step-up required"
        };
      }
      return { ok: false, status: 401, code: "TWO_FA_REQUIRED", message: "2FA required" };
    }
  }

  return { ok: true, user, session, meta };
};

module.exports = {
  noStoreHeaders,
  getRequestMeta,
  requireSuperAdmin,
  isTwoFactorEnforced
};
