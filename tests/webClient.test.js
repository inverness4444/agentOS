const test = require("node:test");
const assert = require("node:assert/strict");
const { WebClient, canonicalizeUrl } = require("../lib/agents/webClient.js");

test("canonicalizeUrl removes tracking params and normalizes host", () => {
  const url = "http://www.example.com/path/?utm_source=ads&gclid=123#fragment";
  const normalized = canonicalizeUrl(url);
  assert.equal(normalized.startsWith("https://example.com/path"), true);
  assert.equal(normalized.includes("utm_source"), false);
  assert.equal(normalized.includes("gclid"), false);
});

test("canonicalizeUrl normalizes vk and t.me", () => {
  const vk = canonicalizeUrl("https://vk.com/brand?w=wall-1_2");
  assert.equal(vk, "https://vk.com/brand");
  const tg = canonicalizeUrl("http://t.me/s/channel?ref=1");
  assert.equal(tg, "https://t.me/channel");
});

test("circuit breaker activates after repeated errors", async () => {
  const client = new WebClient({ maxRequests: 50 });
  client.robotsCache.set("https://example.com", []);
  let fetchCalls = 0;
  client.fetchWithLimit = async () => {
    fetchCalls += 1;
    return { ok: false, status: 503, text: "" };
  };

  for (let i = 0; i < 5; i += 1) {
    await client.fetchPage("https://example.com/page");
  }
  const before = fetchCalls;
  const blocked = await client.fetchPage("https://example.com/page");
  assert.equal("blocked" in blocked, true, "should be blocked after cooldown");
  assert.equal(fetchCalls, before, "should not fetch during cooldown");
});
