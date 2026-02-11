const test = require("node:test");
const assert = require("node:assert/strict");
const { generateMityaOutput } = require("../lib/agents/mitya");
const { unwrapData } = require("./helpers");

const countWords = (text) => {
  if (!text) return 0;
  const matches = text.match(/[A-Za-zА-Яа-я0-9_]+/g);
  return matches ? matches.length : 0;
};

test("mitya outputs mermaid and respects max_blocks", async () => {
  const envelope = await generateMityaOutput({
    diagram_type: "agentos_how_it_works",
    niche: "AgentOS",
    context: { product_one_liner: "AgentOS: ИИ-агенты для бизнеса" },
    constraints: { max_blocks: 6, max_words: 1200, no_fluff: true },
    output_format: "mermaid"
  });
  const output = unwrapData(envelope);

  assert.ok(output.diagram, "diagram present");
  assert.ok(Array.isArray(output.diagram.blocks), "blocks array");
  assert.ok(output.diagram.blocks.length <= 6, "max_blocks respected");
  output.diagram.blocks.forEach((block) => {
    assert.ok(typeof block.owner === "string" && block.owner.length > 0, "owner present");
    assert.ok(typeof block.icon_hints === "string" && block.icon_hints.length > 0, "icon_hints present");
  });
  assert.ok(Array.isArray(output.diagram.integration_points), "integration_points present");
  assert.ok(output.diagram.mermaid, "mermaid present");
  assert.equal(output.meta.quality_checks.has_mermaid_if_requested, true, "has mermaid ok");
  assert.equal(output.meta.quality_checks.within_max_words, true, "within_max_words true");

  const bodyWords = countWords(output.landing_text.body);
  assert.ok(bodyWords >= 150 && bodyWords <= 250, `landing_text body length ok: ${bodyWords}`);
});

test("mitya returns sequence mermaid for both format when needed", async () => {
  const envelope = await generateMityaOutput({
    diagram_type: "customer_journey",
    niche: "AgentOS",
    context: { product_one_liner: "AgentOS: ИИ-агенты для бизнеса" },
    constraints: { max_blocks: 10, max_words: 1200, no_fluff: true },
    output_format: "both"
  });
  const output = unwrapData(envelope);
  assert.ok(output.diagram.mermaid, "flowchart mermaid present");
  assert.ok(output.diagram.sequence_mermaid, "sequence mermaid present");
  assert.ok(
    String(output.diagram.sequence_mermaid).startsWith("sequenceDiagram"),
    "sequence diagram syntax"
  );
});

test("mitya asks question when input empty", async () => {
  const envelope = await generateMityaOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  const limitationText = (output.meta.limitations || []).join(" ");
  assert.ok(/что за продукт/i.test(limitationText), "question present");
});
