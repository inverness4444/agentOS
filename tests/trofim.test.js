const test = require("node:test");
const assert = require("node:assert/strict");
const { generateTrofimOutput, normalizeInput } = require("../lib/agents/trofim");
const { unwrapData } = require("./helpers");

const allowedPlatforms = new Set([
  "instagram_reels",
  "tiktok",
  "youtube_shorts",
  "rutube",
  "vk_clips"
]);

test("trofim default platforms include instagram_reels and tiktok", () => {
  const input = normalizeInput({});
  assert.ok(input.platforms.includes("instagram_reels"), "default includes instagram_reels");
  assert.ok(input.platforms.includes("tiktok"), "default includes tiktok");
});

test("trofim output basics and counts", async () => {
  const envelope = await generateTrofimOutput({
    mode: "deep",
    platforms: ["instagram_reels", "tiktok", "youtube_shorts", "rutube", "vk_clips"],
    platform_priority: ["instagram_reels", "tiktok"],
    niche: "AgentOS/автоматизация",
    goal: "views",
    references: {
      themes: ["разбор хука", "ошибка в первые 2 сек"],
      transcripts: ["Стоп. В первые 2 секунды все решается. Покажу пример."],
      formats_liked: ["разбор за 20 сек"],
      creators: []
    },
    constraints: { max_formats: 15, max_words: 2000, no_fluff: true }
  });
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.formats), "formats array");
  assert.ok(output.formats.length >= 10, "formats >= 10");
  assert.ok(output.formats.length <= 15, "formats <= max_formats");

  const sample = output.formats[0];
  assert.ok(sample.format_name, "format_name present");
  assert.ok(Array.isArray(sample.best_platforms), "best_platforms array");
  sample.best_platforms.forEach((item) => {
    assert.ok(allowedPlatforms.has(item), "platform allowed");
  });
  assert.ok(sample.script_structure, "script_structure present");
  assert.ok(sample.script_structure.value_3_15s.length >= 2, "value beats >=2");
  assert.ok(sample.script_structure.value_3_15s.length <= 4, "value beats <=4");
  assert.ok(sample.script_structure.proof_15_30s.length >= 1, "proof beats >=1");
  assert.ok(sample.script_structure.proof_15_30s.length <= 3, "proof beats <=3");
  assert.ok(sample.platform_tweaks, "platform_tweaks present");
  sample.best_platforms.forEach((key) => {
    assert.ok(sample.platform_tweaks[key], `platform_tweaks ${key}`);
  });

  assert.ok(output.recommendations.hooks_bank.length >= 20, "hooks_bank 20+");
  assert.ok(output.recommendations.platform_notes, "platform_notes present");
  const notes = output.recommendations.platform_notes;
  ["instagram_reels", "tiktok", "youtube_shorts", "rutube", "vk_clips"].forEach((key) => {
    assert.ok(Array.isArray(notes[key]), `platform_notes ${key}`);
    assert.ok(notes[key].length >= 3, `platform_notes ${key} length`);
  });
  assert.ok(output.recommendations.hooks_by_platform, "hooks_by_platform present");
  const hooksByPlatform = output.recommendations.hooks_by_platform;
  ["instagram_reels", "tiktok", "youtube_shorts", "rutube", "vk_clips"].forEach((key) => {
    assert.ok(Array.isArray(hooksByPlatform[key]), `hooks_by_platform ${key}`);
    assert.ok(
      hooksByPlatform[key].length >= 10 && hooksByPlatform[key].length <= 12,
      `hooks_by_platform ${key} length`
    );
  });
  assert.ok(output.recommendations.format_risks_by_platform, "format_risks_by_platform present");
  output.recommendations.content_mix_week.forEach((item) => {
    assert.ok(item.platform, "content_mix_week includes platform");
    assert.ok(item.format_name, "content_mix_week includes format_name");
  });

  const notesByPlatform = output.recommendations.platform_notes;
  const platforms = ["instagram_reels", "tiktok", "youtube_shorts", "rutube", "vk_clips"];
  for (let i = 0; i < platforms.length; i += 1) {
    for (let j = i + 1; j < platforms.length; j += 1) {
      const a = new Set((notesByPlatform[platforms[i]] || []).map((s) => s.trim().toLowerCase()));
      const b = new Set((notesByPlatform[platforms[j]] || []).map((s) => s.trim().toLowerCase()));
      const intersection = [...a].filter((item) => b.has(item)).length;
      const union = new Set([...a, ...b]).size || 1;
      const overlap = intersection / union;
      assert.ok(overlap <= 0.3, `platform_notes overlap <=30% for ${platforms[i]} vs ${platforms[j]}`);
    }
  }

  const top5 = output.recommendations.top_5_to_start || [];
  const formatByName = new Map(output.formats.map((item) => [item.format_name, item]));
  const priorityMatches = top5.filter((name) => {
    const format = formatByName.get(name);
    return (
      format &&
      Array.isArray(format.best_platforms) &&
      format.best_platforms.some((platform) => ["instagram_reels", "tiktok"].includes(platform))
    );
  }).length;
  assert.ok(priorityMatches >= 3, "top_5_to_start keeps >=3 priority platform formats");
  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");
  assert.equal(output.meta.quality_checks.no_fluff, true, "no_fluff true");
  assert.equal(output.meta.quality_checks.formats_count_ok, true, "formats_count_ok true");
  assert.equal(
    output.meta.quality_checks.platforms_supported_ok,
    true,
    "platforms_supported_ok true"
  );
});

test("trofim asks question when input empty", async () => {
  const envelope = await generateTrofimOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(/какая ниша/i.test(limitationText), "question present");
});

test("trofim respects max_formats", async () => {
  const envelope = await generateTrofimOutput({
    niche: "B2B",
    goal: "leads",
    references: { themes: ["кейсы", "разбор ошибок"] },
    constraints: { max_formats: 12, max_words: 600, no_fluff: true }
  });
  const output = unwrapData(envelope);

  assert.ok(output.formats.length >= 10, "formats >= 10");
  assert.ok(output.formats.length <= 12, "formats <= max_formats");
  assert.equal(output.meta.quality_checks.formats_count_ok, true, "formats_count_ok true");
});
