const crypto = require("crypto");

const clampScore = (value, min = 0, max = 100) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const stableTextFingerprint = (text) => {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha1").update(normalized).digest("hex");
};

module.exports = { clampScore, stableTextFingerprint };
