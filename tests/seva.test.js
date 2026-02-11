const test = require("node:test");
const assert = require("node:assert/strict");
const { generateSevaOutput } = require("../lib/agents/seva");
const { unwrapData } = require("./helpers");

test("seva pack complete and grounded", async () => {
  const envelope = await generateSevaOutput({
    niche: "AgentOS/автоматизация",
    source_asset: {
      type: "case",
      text: "Сжали процесс и получили 24 заявки за 7 дней.",
      key_numbers: ["24", "7"],
      proof_points: ["скрин метрики"]
    },
    offer: { product_name: "AgentOS", cta_preference: "dm" },
    constraints: { max_words: 1200, keep_claims_grounded: true }
  });
  const output = unwrapData(envelope);

  assert.ok(output.pack, "pack present");
  assert.ok(output.pack.tg_short, "tg_short present");
  assert.ok(output.pack.tg_long, "tg_long present");
  assert.ok(output.pack.vk_post, "vk_post present");
  assert.ok(output.pack.shorts_script, "shorts_script present");
  assert.ok(output.pack.carousel, "carousel present");
  assert.ok(output.pack.faq, "faq present");
  assert.ok(output.pack.email, "email present");
  assert.ok(Array.isArray(output.pack.claims_used), "claims_used present");
  assert.ok(output.pack.claims_used.length > 0, "claims_used not empty");
  assert.ok(output.pack.platform_variants, "platform_variants present");
  assert.equal(output.pack.platform_variants.shorts_hooks.length, 2, "shorts hooks x2");
  assert.equal(output.pack.platform_variants.email_subjects.length, 2, "email subjects x2");
  output.pack.faq.forEach((item) => {
    assert.ok(["price", "trust", "time", "implementation"].includes(item.objection_type));
  });

  assert.equal(output.pack.email.within_900_chars, true, "email within 900 chars");
  assert.equal(output.meta.quality_checks.grounded_claims_ok, true, "grounded_claims_ok true");
  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");
  assert.equal(output.meta.quality_checks.pack_complete, true, "pack_complete true");
});

test("seva asks question when input empty", async () => {
  const envelope = await generateSevaOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(/скинь текст/i.test(limitationText), "question present");
});
