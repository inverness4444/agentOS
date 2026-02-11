const test = require("node:test");
const assert = require("node:assert/strict");
const { isSameOriginRequest } = require("../lib/security/request.js");

const makeRequest = ({ host, origin, referer }) =>
  ({
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === "host") return host || "";
        if (key === "origin") return origin || "";
        if (key === "referer") return referer || "";
        return "";
      }
    }
  });

test("isSameOriginRequest accepts same origin", () => {
  const request = makeRequest({
    host: "localhost:3000",
    origin: "http://localhost:3000",
    referer: "http://localhost:3000/billing"
  });
  assert.equal(isSameOriginRequest(request), true);
});

test("isSameOriginRequest rejects cross-origin", () => {
  const request = makeRequest({
    host: "localhost:3000",
    origin: "https://evil.example.com",
    referer: "https://evil.example.com/form"
  });
  assert.equal(isSameOriginRequest(request), false);
});
