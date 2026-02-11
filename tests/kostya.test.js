const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKostyaOutput } = require("../lib/agents/kostya");
const { unwrapData } = require("./helpers");

test("kostya concepts count and prompts", async () => {
  const envelope = await generateKostyaOutput({
    niche: "AgentOS/автоматизация",
    content_inputs: { headline: "3 точки роста за 7 дней" },
    constraints: { concepts_count: 5, no_logos: true, no_faces: true, max_words: 1200 }
  });
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.concepts), "concepts array");
  assert.equal(output.concepts.length, 5, "concepts_count соблюдается");

  output.concepts.forEach((concept) => {
    assert.ok(concept.prompts.main.length > 0, "prompts.main not empty");
    assert.ok(concept.prompts.negative.length > 0, "negative prompt present");
    assert.ok(concept.prompt_tokens, "prompt_tokens present");
    ["subject", "background", "typography_placeholders", "style", "composition", "negatives"].forEach((key) => {
      assert.ok(typeof concept.prompt_tokens[key] === "string", `prompt_tokens.${key}`);
    });
    assert.ok(concept.text_safe_area_notes, "text_safe_area_notes present");
    ["1:1", "9:16", "16:9"].forEach((ratio) => {
      assert.ok(typeof concept.text_safe_area_notes[ratio] === "string", `safe area ${ratio}`);
    });
    assert.ok(concept.compliance_checks, "compliance_checks present");
    assert.ok(/logo/i.test(concept.prompts.main) || /LOGO/.test(concept.designer_brief.editable_layers.join(" ")), "no_logos reflected");
    assert.ok(/лиц|face/i.test(concept.prompts.negative), "no_faces reflected");
    assert.equal(concept.compliance_checks.no_logos_prompted, true, "no_logos compliance");
    assert.equal(concept.compliance_checks.no_faces_prompted, true, "no_faces compliance");
  });

  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");
});

test("kostya asks question when input empty", async () => {
  const envelope = await generateKostyaOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(/какая ниша/i.test(limitationText), "question present");
});
