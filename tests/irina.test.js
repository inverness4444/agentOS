const test = require("node:test");
const assert = require("node:assert/strict");
const { generateIrinaOutput } = require("../lib/agents/irina");
const { unwrapData } = require("./helpers");

test("irina topics and pillars counts", async () => {
  const envelope = await generateIrinaOutput({
    niche: "AgentOS/автоматизация",
    goal: "leads",
    platforms: ["telegram", "vk", "youtube_shorts", "instagram_reels"],
    constraints: { topics_min: 30, topics_max: 50, no_fluff: true, max_words: 2000 }
  });
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.pillars), "pillars array");
  assert.ok(output.pillars.length >= 6, "pillars >= 6");
  assert.ok(output.pillars.length <= 10, "pillars <= 10");

  assert.ok(Array.isArray(output.topics), "topics array");
  assert.ok(output.topics.length >= 30, "topics >= 30");
  assert.ok(output.topics.length <= 50, "topics <= 50");
  output.topics.forEach((topic) => {
    assert.ok(typeof topic.lead_asset === "string" && topic.lead_asset.length > 0, "lead_asset");
    assert.ok(
      ["dm_keyword", "comment_keyword", "landing_form"].includes(topic.capture_mechanism),
      "capture_mechanism"
    );
    assert.ok(typeof topic.series_group === "string" && topic.series_group.length > 0, "series_group");
    assert.ok(typeof topic.repurpose_hint === "string" && topic.repurpose_hint.length > 0, "repurpose_hint");
  });

  assert.ok(output.cta_bank, "cta_bank present");
  assert.ok(output.cta_bank.dm_cta.length > 0, "dm_cta non-empty");
  assert.ok(output.cta_bank.tg_cta.length > 0, "tg_cta non-empty");
  assert.ok(output.cta_bank.landing_cta.length > 0, "landing_cta non-empty");
  assert.ok(output.cta_bank.comment_cta.length > 0, "comment_cta non-empty");

  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");
  assert.equal(output.meta.quality_checks.no_fluff, true, "no_fluff true");
  assert.equal(output.meta.quality_checks.topics_count_ok, true, "topics_count_ok true");
});

test("irina asks question when niche missing", async () => {
  const envelope = await generateIrinaOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(/какая ниша/i.test(limitationText), "question present");
});
