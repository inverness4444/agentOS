const test = require("node:test");
const assert = require("node:assert/strict");
const { checkRateLimit } = require("../lib/security/rateLimit.js");

test("checkRateLimit blocks requests after limit", () => {
  const storeName = `test-${Date.now()}`;
  const key = "user:127.0.0.1";

  const first = checkRateLimit({ storeName, key, windowMs: 1_000, limit: 2 });
  const second = checkRateLimit({ storeName, key, windowMs: 1_000, limit: 2 });
  const third = checkRateLimit({ storeName, key, windowMs: 1_000, limit: 2 });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
});
