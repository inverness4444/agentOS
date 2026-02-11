const test = require("node:test");
const assert = require("node:assert/strict");
const guardCore = require("../lib/admin/guardCore.js");

const { requireSuperAdminCore, verifyCsrfCore } = guardCore;

test("requireSuperAdminCore allows active super admin", () => {
  const result = requireSuperAdminCore({ role: "SUPER_ADMIN", status: "ACTIVE" });
  assert.equal(result.ok, true);
});

test("requireSuperAdminCore blocks non-super-admin", () => {
  const result = requireSuperAdminCore({ role: "ADMIN", status: "ACTIVE" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "FORBIDDEN");
});

test("requireSuperAdminCore blocks blocked user", () => {
  const result = requireSuperAdminCore({ role: "SUPER_ADMIN", status: "BLOCKED" });
  assert.equal(result.ok, false);
  assert.equal(result.code, "USER_BLOCKED");
});

test("verifyCsrfCore checks strict token equality", () => {
  assert.equal(
    verifyCsrfCore({ headerToken: "token-1", cookieToken: "token-1" }),
    true
  );
  assert.equal(
    verifyCsrfCore({ headerToken: "token-1", cookieToken: "token-2" }),
    false
  );
  assert.equal(verifyCsrfCore({ headerToken: "", cookieToken: "token-2" }), false);
});
