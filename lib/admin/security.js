const crypto = require("node:crypto");
const { cookies } = require("next/headers");
const { isSameOriginRequest } = require("../security/request.js");
const { checkRateLimit } = require("../security/rateLimit.js");

const ADMIN_CSRF_COOKIE = "agentos_admin_csrf";
const ADMIN_2FA_COOKIE = "agentos_admin_2fa";

const ADMIN_RATE_LIMIT_WINDOW_MS = 60_000;
const ADMIN_RATE_LIMIT_MAX = 120;

const toBuffer = (value) => Buffer.from(String(value || ""), "utf8");

const safeEqual = (left, right) => {
  const a = toBuffer(left);
  const b = toBuffer(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const getEncryptionKey = () => {
  const base = String(
    process.env.ADMIN_2FA_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "dev-admin-2fa-key"
  );
  return crypto.createHash("sha256").update(base).digest();
};

const encryptText = (value) => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
};

const decryptText = (packed) => {
  const raw = String(packed || "");
  const [ivPart, tagPart, dataPart] = raw.split(".");
  if (!ivPart || !tagPart || !dataPart) return null;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const encrypted = Buffer.from(dataPart, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
};

const randomToken = (size = 24) => crypto.randomBytes(size).toString("base64url");

const issueCsrfToken = (response) => {
  const token = randomToken(18);
  response.cookies.set(ADMIN_CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60
  });
  return token;
};

const validateCsrf = async (request) => {
  const headerToken = String(request.headers.get("x-csrf-token") || "");
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(ADMIN_CSRF_COOKIE)?.value || "";
  if (!headerToken || !cookieToken) return false;
  return safeEqual(headerToken, cookieToken);
};

const sign2faPayload = (payload) => {
  const secret = String(process.env.ADMIN_2FA_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "dev-2fa-cookie");
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
};

const create2faCookieValue = (userId, ttlMs = 8 * 60 * 60 * 1000) => {
  const exp = Date.now() + ttlMs;
  const verifiedAt = Date.now();
  const nonce = randomToken(10);
  const payload = `${String(userId)}.${exp}.${verifiedAt}.${nonce}`;
  const signature = sign2faPayload(payload);
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
};

const set2faCookie = (response, userId) => {
  const token = create2faCookieValue(userId);
  response.cookies.set(ADMIN_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60
  });
  return token;
};

const clear2faCookie = (response) => {
  response.cookies.set(ADMIN_2FA_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
};

const hasValid2faCookie = async (userId, options = {}) => {
  const { maxAgeMs } = options;
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_2FA_COOKIE)?.value || "";
  if (!raw.includes(".")) return false;
  const [payloadPart, signature] = raw.split(".");
  if (!payloadPart || !signature) return false;
  const payload = Buffer.from(payloadPart, "base64url").toString("utf8");
  const expected = sign2faPayload(payload);
  if (!safeEqual(signature, expected)) return false;
  const [cookieUserId, expRaw, verifiedAtRaw] = payload.split(".");
  if (!cookieUserId || !expRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  if (Number.isFinite(maxAgeMs)) {
    const verifiedAt = Number(verifiedAtRaw);
    if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt > maxAgeMs) {
      return false;
    }
  }
  return String(cookieUserId) === String(userId);
};

const checkAdminRateLimit = (key) => {
  return checkRateLimit({
    storeName: "admin-guard",
    key,
    windowMs: ADMIN_RATE_LIMIT_WINDOW_MS,
    limit: ADMIN_RATE_LIMIT_MAX
  });
};

const validateSameOrigin = (request) => isSameOriginRequest(request);

module.exports = {
  ADMIN_CSRF_COOKIE,
  ADMIN_2FA_COOKIE,
  issueCsrfToken,
  validateCsrf,
  set2faCookie,
  clear2faCookie,
  hasValid2faCookie,
  encryptText,
  decryptText,
  randomToken,
  safeEqual,
  checkAdminRateLimit,
  validateSameOrigin
};
