const test = require("node:test");
const assert = require("node:assert/strict");
const { generatePavelOutput } = require("../lib/agents/pavel");
const { generateIrinaOutput } = require("../lib/agents/irina");
const { generateHaritonOutput } = require("../lib/agents/hariton");
const { unwrapData } = require("./helpers");

const longTranscript = Array.from({ length: 80 }, (_, i) => `шаг ${i + 1} с доказательством и CTA`).join(". ");

test("shape is preserved under tight max_words budgets", async () => {
  const pavelEnvelope = await generatePavelOutput({
    niche: "маркетинг",
    input_content: { transcript: longTranscript },
    budget: { max_words: 110 }
  });
  const pavel = unwrapData(pavelEnvelope);
  assert.ok(pavel.analysis && pavel.script_skeleton && pavel.improvements, "pavel required keys");
  assert.ok(Array.isArray(pavel.script_skeleton.on_screen_text_by_second), "pavel timeline array");
  assert.ok(pavel.script_skeleton.on_screen_text_by_second.length >= 3, "pavel minimum timeline");
  assert.ok(Array.isArray(pavel.improvements.rewrite_options), "pavel rewrite_options array");
  assert.ok(pavel.improvements.rewrite_options.length >= 2, "pavel minimum rewrite options");
  assert.equal(pavelEnvelope.meta.quality_checks.within_limits, true, "pavel within_limits");

  const haritonEnvelope = await generateHaritonOutput({
    niche: "доставка",
    offer: { one_liner: "Автоматизация коммуникаций" },
    assets: { proof_points: ["скрин процесса"], objections: [], mini_cases: [] },
    budget: { max_words: 180 }
  });
  const hariton = unwrapData(haritonEnvelope);
  assert.ok(Array.isArray(hariton.hooks), "hariton hooks");
  assert.ok(Array.isArray(hariton.posts), "hariton posts");
  assert.ok(Array.isArray(hariton.scripts), "hariton scripts");
  const haritonMinHooks = haritonEnvelope.meta.input_echo?.constraints?.hooks_count ?? 0;
  const haritonMinPosts = haritonEnvelope.meta.input_echo?.constraints?.posts_count ?? 0;
  const haritonMinScripts = haritonEnvelope.meta.input_echo?.constraints?.scripts_count ?? 0;
  assert.ok(hariton.hooks.length >= haritonMinHooks, "hariton hooks minimum preserved");
  assert.ok(hariton.posts.length >= haritonMinPosts, "hariton posts minimum preserved");
  assert.ok(hariton.scripts.length >= haritonMinScripts, "hariton scripts minimum preserved");
  assert.equal(haritonEnvelope.meta.quality_checks.within_limits, true, "hariton within_limits");

  const irinaEnvelope = await generateIrinaOutput({
    niche: "b2b интегратор",
    content_assets: { offers: ["аудит"], proofs: ["кейс"], кейсы: [] },
    budget: { max_words: 150, max_items: 3 }
  });
  const irina = unwrapData(irinaEnvelope);
  assert.ok(Array.isArray(irina.topics), "irina topics array");
  const irinaMin = irinaEnvelope.meta.input_echo?.constraints?.topics_min ?? 0;
  assert.ok(irina.topics.length >= irinaMin, "irina topics not below minimum");
  assert.ok(irina.topics.every((item) => item.lead_asset && item.capture_mechanism), "irina required topic fields");
  assert.equal(irinaEnvelope.meta.quality_checks.within_limits, true, "irina within_limits");

  const allLimitations = [
    ...(Array.isArray(pavelEnvelope.meta.limitations) ? pavelEnvelope.meta.limitations : []),
    ...(Array.isArray(haritonEnvelope.meta.limitations) ? haritonEnvelope.meta.limitations : []),
    ...(Array.isArray(irinaEnvelope.meta.limitations) ? irinaEnvelope.meta.limitations : [])
  ];
  assert.ok(
    allLimitations.length === 0 || allLimitations.includes("compressed_heavily"),
    "tight compression may be marked as compressed_heavily"
  );
});
