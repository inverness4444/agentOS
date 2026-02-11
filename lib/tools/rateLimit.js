const limits = new Map();

const WINDOW_MS = 60 * 1000;
const MAX_CALLS = 30;

const checkRateLimit = (userId) => {
  const now = Date.now();
  const entry = limits.get(userId) || [];
  const filtered = entry.filter((timestamp) => now - timestamp < WINDOW_MS);
  if (filtered.length >= MAX_CALLS) {
    limits.set(userId, filtered);
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - filtered[0]) };
  }
  filtered.push(now);
  limits.set(userId, filtered);
  return { allowed: true };
};

module.exports = { checkRateLimit };
