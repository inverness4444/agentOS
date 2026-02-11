const test = require("node:test");
const assert = require("node:assert/strict");
const { generateHaritonOutput } = require("../lib/agents/hariton");
const { unwrapData } = require("./helpers");

const hasFluff = (text) =>
  /(инновац|уникальн|синерг|экосистем|под\s*ключ)/i.test(text);

test("hariton counts and no_fluff", async () => {
  const envelope = await generateHaritonOutput({
    niche: "AgentOS/автоматизация",
    offer: { one_liner: "ИИ-агенты для бизнеса", cta_preference: "dm" },
    constraints: {
      hooks_count: 50,
      posts_count: 10,
      scripts_count: 10,
      max_words: 3000,
      no_fluff: true
    }
  });
  const output = unwrapData(envelope);

  assert.equal(output.hooks.length, 50, "hooks_count соблюдается");
  assert.equal(output.posts.length, 10, "posts_count соблюдается");
  assert.equal(output.scripts.length, 10, "scripts_count соблюдается");
  output.hooks.forEach((hook) => {
    assert.ok(typeof hook.category === "string" && hook.category.length > 0, "hook category");
    assert.ok(typeof hook.hook_text === "string" && hook.hook_text.length > 0, "hook text");
  });
  const distribution = output.meta.hooks_distribution;
  assert.ok(distribution && typeof distribution === "object", "hooks_distribution present");
  Object.values(distribution).forEach((count) => {
    assert.ok(count >= 8 && count <= 10, "category distribution 8-10");
  });
  output.posts.forEach((post) => {
    assert.ok(
      typeof post.one_sentence_takeaway === "string" && post.one_sentence_takeaway.length > 0,
      "one_sentence_takeaway"
    );
  });
  output.scripts.forEach((script) => {
    assert.ok(Array.isArray(script.shot_list) && script.shot_list.length >= 3 && script.shot_list.length <= 6);
    assert.ok(typeof script.proof_action === "string" && script.proof_action.length > 0);
  });

  const allText = JSON.stringify(output);
  assert.equal(hasFluff(allText), false, "blacklist not present");

  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");
  assert.equal(output.meta.quality_checks.no_fluff, true, "no_fluff true");
});

test("hariton asks question when input empty", async () => {
  const envelope = await generateHaritonOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(/какая ниша/i.test(limitationText), "question present");
});
