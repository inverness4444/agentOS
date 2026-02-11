const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { normalizePhone } = require("../utils/normalize");

const fixturesPath = path.join(__dirname, "..", "fixtures", "normalize", "phones.json");
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

test("normalizePhone supports RU formats and returns null+warning for ambiguous", () => {
  fixtures.forEach((item, index) => {
    const warnings = [];
    const actual = normalizePhone(item.raw, {
      returnNullOnFailure: true,
      warnings
    });

    assert.equal(actual, item.expected, `fixture #${index} raw=${item.raw}`);

    if (item.expected === null) {
      assert.ok(warnings.length > 0, `fixture #${index} should produce warning`);
    } else {
      assert.equal(warnings.length, 0, `fixture #${index} should not warn`);
    }
  });
});
