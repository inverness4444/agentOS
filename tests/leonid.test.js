const test = require("node:test");
const assert = require("node:assert/strict");
const { generateLeonidOutput } = require("../lib/agents/leonid");
const { unwrapData } = require("./helpers");

const anatolyOutput = {
  account_card: {
    company_name: "ТестКомпания",
    top_personalization_hooks: [
      { hook_text: "много отзывов о доставке", related_proofs: [0] }
    ],
    pain_hypotheses: [
      { hypothesis: "доставка медленная", related_proofs: [1] }
    ]
  },
  meta: {
    proof_items: [{ url: "https://example.com" }, { url: "https://example.com/2" }]
  }
};

const artemOutput = {
  hot_leads: [
    {
      title: "Ищут подрядчика по Bitrix24",
      hot_reasons: ["ищут подрядчика по Bitrix24"],
      request_summary: "ищут подрядчика по Bitrix24 срочно",
      proof_refs: [0]
    }
  ],
  meta: {
    proof_items: [{ url: "https://vk.com/wall-1_2" }]
  }
};

test("leonid respects char limits and no fluff", async () => {
  const envelope = await generateLeonidOutput({
    tone_pack: "neutral",
    constraints: { max_chars_first: 200, max_chars_followup: 160 },
    anatoly_output_json: anatolyOutput
  });
  const output = unwrapData(envelope);

  const first = output.dm_pack.messages.first_message;
  assert.ok(first.text.length <= 200, "first message within limit");
  output.dm_pack.messages.followups.forEach((item) => {
    assert.ok(item.text.length <= 160, "followup within limit");
  });
  assert.equal(output.meta.quality_checks.no_fluff, true, "no fluff");
});

test("grounding refs present with proofs", async () => {
  const envelope = await generateLeonidOutput({
    tone_pack: "neutral",
    anatoly_output_json: anatolyOutput
  });
  const output = unwrapData(envelope);
  assert.ok(
    output.dm_pack.messages.first_message.grounding_refs.length > 0,
    "grounding refs present"
  );
});

test("tone_pack mixed produces variants", async () => {
  const envelope = await generateLeonidOutput({
    tone_pack: "mixed",
    anatoly_output_json: anatolyOutput,
    artem_output_json: artemOutput
  });
  const output = unwrapData(envelope);
  assert.ok(Array.isArray(output.dm_pack.variants), "variants array");
  assert.ok(output.dm_pack.variants.length >= 3, "has variants");
  output.dm_pack.variants.forEach((variant) => {
    assert.ok(variant.followups.length >= 2, "followups 2+" );
    if (variant.tone === "business" || variant.tone === "short_hard") {
      assert.ok(
        typeof variant.first_message.objection_preempt_line === "string",
        "objection_preempt_line present"
      );
    }
  });
});

test("channel_tweaks and link_policy work", async () => {
  const anatolyWithLink = {
    ...anatolyOutput,
    account_card: {
      ...anatolyOutput.account_card,
      top_personalization_hooks: [
        { hook_text: "смотрите ссылку https://example.com/details", related_proofs: [0] }
      ]
    }
  };

  const tgEnvelope = await generateLeonidOutput({
    channel: "telegram",
    tone_pack: "neutral",
    constraints: { no_links: true },
    anatoly_output_json: anatolyWithLink
  });
  const waEnvelope = await generateLeonidOutput({
    channel: "whatsapp",
    tone_pack: "neutral",
    constraints: { no_links: true },
    anatoly_output_json: anatolyWithLink
  });

  const tg = unwrapData(tgEnvelope);
  const wa = unwrapData(waEnvelope);
  assert.ok(tg.dm_pack.channel_tweaks && wa.dm_pack.channel_tweaks, "channel_tweaks present");
  assert.ok(tg.meta.link_policy.no_links, "link_policy present");
  assert.equal(/https?:\/\/|ссылк|линк/i.test(tg.dm_pack.messages.first_message.text), false);
  assert.ok(/скину текстом/i.test(tg.dm_pack.messages.first_message.text), "replaced with text mode");
  assert.notEqual(
    tg.dm_pack.messages.first_message.text,
    wa.dm_pack.messages.first_message.text,
    "channel style differs"
  );
});

test("missing inputs asks question", async () => {
  const envelope = await generateLeonidOutput({});
  const output = unwrapData(envelope);
  assert.ok(output.meta.needsReview, "needsReview true");
  assert.ok(output.dm_pack.messages.first_message.text.length > 0, "question present");
});
