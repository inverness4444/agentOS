const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateProofCoverage } = require("../lib/agents/timofey");

test("timofey proof coverage <0.4 sets needsReview and limitation", () => {
  const status = evaluateProofCoverage(0.3);
  assert.equal(status.needsReview, true);
  assert.deepEqual(status.warnings, []);
  assert.ok(status.limitations.includes("low_proof_coverage"));
});

test("timofey proof coverage 0.4-0.6 sets warning only", () => {
  const status = evaluateProofCoverage(0.5);
  assert.equal(status.needsReview, false);
  assert.ok(status.warnings.includes("low_proof_coverage"));
  assert.deepEqual(status.limitations, []);
});

test("timofey proof coverage >=0.6 is ok", () => {
  const status = evaluateProofCoverage(0.7);
  assert.equal(status.needsReview, false);
  assert.deepEqual(status.warnings, []);
  assert.deepEqual(status.limitations, []);
});
