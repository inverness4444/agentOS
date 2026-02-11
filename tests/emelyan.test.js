const test = require("node:test");
const assert = require("node:assert/strict");
const { generateEmelyanOutput } = require("../lib/agents/emelyan");
const { unwrapData } = require("./helpers");

const anatolyOutput = {
  account_card: {
    company_name: "ТестКомпания",
    top_personalization_hooks: [
      { hook_text: "много отзывов о доставке", related_proofs: [0] }
    ],
    pain_hypotheses: [
      { hypothesis: "частые жалобы на сроки", related_proofs: [1] }
    ]
  },
  meta: {
    proof_items: [{ url: "https://example.com" }, { url: "https://example.com/2" }]
  }
};

test("emelyan output basics and limits", async () => {
  const envelope = await generateEmelyanOutput({
    tone_pack: "short",
    constraints: { max_chars_email: 400, max_bullets: 2 },
    anatoly_output_json: anatolyOutput
  });
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.email_sequences), "email_sequences array");
  const sequence = output.email_sequences[0];
  assert.ok(sequence.emails.length >= 2, "has followups");

  sequence.emails.forEach((email) => {
    assert.ok(email.subject.length > 0, "subject not empty");
    assert.ok(email.body.length <= 400, "body within limit");
    assert.ok(email.bullets.length <= 2, "bullets within limit");
    const subjectWords = email.subject.split(/\s+/).filter(Boolean).length;
    assert.ok(subjectWords >= 1 && subjectWords <= 8, "subject_rules word limit");
    assert.equal(/[A-ZА-ЯЁ]{3,}/.test(email.subject), false, "no all-caps subject");
    assert.equal(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(email.subject), false, "no emoji");
    assert.ok(
      typeof email.preview_line === "string" &&
        email.preview_line.length >= 40 &&
        email.preview_line.length <= 70,
      "preview_line 40-70"
    );
  });

  assert.equal(output.meta.quality_checks.no_fluff, true, "no_fluff true");
  assert.ok(output.meta.quality_checks.subject_rules_ok, "subject_rules_ok");
  assert.ok(output.meta.quality_checks.preview_line_ok, "preview_line_ok");
  assert.ok(output.meta.spam_risk_checks, "spam_risk_checks present");
  const firstEmail = sequence.emails[0];
  assert.ok(firstEmail.grounding_refs.length > 0, "grounding_refs present");
});

test("tone_pack mixed produces 3 sequences", async () => {
  const envelope = await generateEmelyanOutput({
    tone_pack: "mixed",
    anatoly_output_json: anatolyOutput
  });
  const output = unwrapData(envelope);
  assert.equal(output.email_sequences.length, 3, "3 sequences for mixed");
  const hard = output.email_sequences.find((seq) => seq.sequence_name === "жёстко-деловая");
  assert.ok(hard, "hard_business sequence present");
  const offsets = hard.emails.map((email) => email.day_offset);
  assert.ok(offsets.includes(9), "breakup on day 9");
});
