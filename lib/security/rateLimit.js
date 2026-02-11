const globalStore = globalThis;
const stores = globalStore.__agentosRateLimitStores || new Map();
globalStore.__agentosRateLimitStores = stores;

const getStore = (name = "default") => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};

const checkRateLimit = ({
  storeName = "default",
  key = "anonymous",
  windowMs = 60_000,
  limit = 60
}) => {
  const now = Date.now();
  const store = getStore(storeName);
  const safeKey = String(key || "anonymous");
  const existing = store.get(safeKey);

  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(safeKey, next);
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt: next.resetAt
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt
    };
  }

  existing.count += 1;
  store.set(safeKey, existing);
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt
  };
};

module.exports = {
  checkRateLimit
};
