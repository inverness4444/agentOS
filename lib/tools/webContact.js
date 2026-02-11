const { isSafeUrl, fetchTextWithLimit } = require("./http.js");
const { sanitizeSnippet } = require("../../utils/sanitizeSnippet.js");

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/g;

const SOCIAL_PATTERNS = {
  tg: /https?:\/\/(t\.me|telegram\.me)\/[^"'\s)]+/gi,
  vk: /https?:\/\/(vk\.com|vk\.ru)\/[^"'\s)]+/gi,
  insta: /https?:\/\/(instagram\.com|instagr\.am)\/[^"'\s)]+/gi,
  other: /https?:\/\/(ok\.ru|youtube\.com|youtu\.be|wa\.me|whatsapp\.com|viber\.com)\/[^"'\s)]+/gi
};

const pickContactUrl = (html) => {
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const candidates = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href) continue;
    const lower = href.toLowerCase();
    if (
      lower.includes("contact") ||
      lower.includes("contacts") ||
      lower.includes("контакт") ||
      lower.includes("o-nas") ||
      lower.includes("about")
    ) {
      candidates.push(href);
    }
  }
  return candidates[0];
};

const extractSocials = (html) => {
  const socials = { tg: [], vk: [], insta: [], other: [] };
  Object.entries(SOCIAL_PATTERNS).forEach(([key, pattern]) => {
    const matches = html.match(pattern);
    if (matches) {
      socials[key] = Array.from(new Set(matches));
    }
  });
  return socials;
};

const extractEmails = (html) => {
  const matches = html.match(EMAIL_REGEX);
  if (!matches) return [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase())));
};

const extractPhones = (html) => {
  const matches = html.match(PHONE_REGEX);
  if (!matches) return [];
  const cleaned = matches
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
};

const webContactExtractor = async ({ url }, options = {}) => {
  const safe = await isSafeUrl(url);
  if (!safe) {
    return {
      emails: [],
      phones: [],
      socials: { tg: [], vk: [], insta: [], other: [] },
      error: "Blocked URL",
      rawSnippet: ""
    };
  }

  const maxBytes = Number(options.maxBytes || 1024 * 1024 * 2);
  const timeoutMs = Number(options.timeoutMs || 15000);
  const html = await fetchTextWithLimit(url, {}, { timeoutMs, maxBytes });
  const emails = extractEmails(html);
  const phones = extractPhones(html);
  const socials = extractSocials(html);
  const bestContactUrl = pickContactUrl(html);

  return {
    emails,
    phones,
    socials,
    bestContactUrl,
    rawSnippet: sanitizeSnippet(html, 300)
  };
};

module.exports = { webContactExtractor };
