const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return "";
  const cleaned = email.trim().toLowerCase();
  if (!cleaned.includes("@")) return "";
  return cleaned;
};

const pushPhoneWarning = (options, raw, code) => {
  if (!options || !Array.isArray(options.warnings)) return;
  options.warnings.push({ code, raw });
};

const resolvePhoneFallback = (options, raw, code) => {
  pushPhoneWarning(options, raw, code);
  return options && options.returnNullOnFailure ? null : "";
};

const normalizePhone = (phone, options = {}) => {
  if (!phone || typeof phone !== "string") {
    return resolvePhoneFallback(options, phone, "phone_missing");
  }

  const raw = phone.trim();
  if (!raw) {
    return resolvePhoneFallback(options, phone, "phone_missing");
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return resolvePhoneFallback(options, raw, "phone_no_digits");
  }

  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  return resolvePhoneFallback(options, raw, "phone_ru_unrecognized");
};

const PATH_DEDUPE_DOMAINS = ["wildberries.ru", "ozon.ru", "vk.com", "t.me", "telegram.me"];

const extractDomainFromUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (PATH_DEDUPE_DOMAINS.some((domain) => host.endsWith(domain))) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const path = parts.length ? `/${parts[0]}` : "";
      return `${host}${path}`.toLowerCase();
    }
    return host;
  } catch {
    const cleaned = url.toLowerCase().replace(/^www\./, "");
    if (cleaned.includes("/")) {
      const [host, first] = cleaned.split("/");
      if (PATH_DEDUPE_DOMAINS.some((domain) => host.endsWith(domain)) && first) {
        return `${host}/${first}`.toLowerCase();
      }
      return host;
    }
    return cleaned;
  }
};

const normalizeName = (value) => {
  if (!value || typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/ооо|ип|ao|zao|pao|llc|ltd|inc/gi, "")
    .replace(/["'«»]/g, "")
    .replace(/[^a-z0-9а-я]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
};

const makeDedupeKey = (fields = {}, options = {}) => {
  const prefix = options.prefix !== false;
  const inn = fields.inn ? String(fields.inn).replace(/\D/g, "") : "";
  const domain = fields.domain ? String(fields.domain).toLowerCase() : "";
  const phoneRaw = fields.phone ? String(fields.phone) : "";
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const name = normalizeName(fields.name || "");
  const city = normalizeName(fields.city || "");

  if (inn) return prefix ? `inn:${inn}` : inn;
  if (domain) return prefix ? `domain:${domain}` : domain;
  if (phoneDigits) return prefix ? `phone:${phoneDigits}` : phoneDigits;

  const nameCity = `${name}${city ? `_${city}` : ""}` || "unknown";
  return prefix ? `name:${nameCity}` : nameCity;
};

module.exports = {
  normalizeEmail,
  normalizePhone,
  extractDomainFromUrl,
  makeDedupeKey
};
