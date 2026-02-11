const test = require("node:test");
const assert = require("node:assert/strict");
const { generatePavelOutput } = require("../lib/agents/pavel");
const { unwrapData } = require("./helpers");

test("pavel output schema and counts", async () => {
  const envelope = await generatePavelOutput({
    mode: "deep",
    platform: "instagram_reels",
    niche: "услуги",
    goal: "leads",
    input_content: {
      transcript:
        "Стоп. В первые 2 сек все решается. За 14 дней получили 120 лидов. Показал скрин. Пиши 'разбор' в личку.",
      caption: "Короткий разбор ролика",
      on_screen_text: "1 ошибка в 2 сек"
    },
    constraints: { max_words: 350, be_brutally_honest: true }
  });
  const output = unwrapData(envelope);

  assert.ok(output.analysis, "analysis present");
  assert.ok(output.script_skeleton, "script_skeleton present");
  assert.ok(output.improvements, "improvements present");
  assert.ok(output.meta, "meta present");

  const scores = [
    output.analysis.hooks_score,
    output.analysis.pacing_score,
    output.analysis.proof_score,
    output.analysis.cta_score,
    output.analysis.ru_fit_score
  ];
  scores.forEach((score) => {
    assert.equal(typeof score, "number", "score is number");
    assert.ok(score >= 0 && score <= 10, "score within 0-10");
  });

  assert.equal(output.script_skeleton.hook_0_3s.variants.length, 3, "hook variants = 3");
  assert.equal(output.script_skeleton.cta.variants.length, 3, "cta variants = 3");
  assert.ok(Array.isArray(output.analysis.hook_types_detected), "hook_types_detected");
  assert.ok(Array.isArray(output.analysis.missing_elements), "missing_elements");
  assert.ok(
    Array.isArray(output.script_skeleton.on_screen_text_by_second) &&
      output.script_skeleton.on_screen_text_by_second.length >= 3,
    "on_screen_text_by_second present"
  );
  assert.ok(output.improvements.comment_bait.length >= 5, "comment_bait 5+");
  assert.equal(output.improvements.caption_variants.length, 3, "caption_variants = 3");
  assert.equal(output.improvements.rewrite_options.length, 2, "rewrite_options = 2");
  output.improvements.rewrite_options.forEach((option) => {
    const joined = `${option.proof_action} ${(option.lines || []).join(" ")}`.toLowerCase();
    assert.ok(joined.includes("доказ"), "rewrite contains evidence");
    assert.ok(/покажи/.test(joined), "rewrite contains proof action");
  });
  assert.equal(output.improvements.a_b_tests.hook_variants.length, 5, "hook A/B variants = 5");
  assert.equal(output.improvements.a_b_tests.cta_variants.length, 5, "cta A/B variants = 5");
});

test("pavel asks for transcript when input empty", async () => {
  const envelope = await generatePavelOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(
    /скинь текст ролика/i.test(limitationText),
    "asks for transcript"
  );
});

test("pavel respects max_words", async () => {
  const envelope = await generatePavelOutput({
    input_content: {
      transcript:
        "Стоп. В первые 2 сек все решается. За 14 дней получили 120 лидов. Показал скрин. Пиши 'разбор' в личку."
    },
    constraints: { max_words: 200, be_brutally_honest: true }
  });
  const output = unwrapData(envelope);
  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");
});
