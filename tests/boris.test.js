const test = require("node:test");
const assert = require("node:assert/strict");
const { generateBorisOutput } = require("../lib/agents/boris");
const { unwrapData } = require("./helpers");

const maximJson = {
  leads: [
    { name: "Клиника А", website: "https://a.ru", phone: "+7999", city: "Москва", category: "Стоматология", dedupe_key: "domain:a.ru" }
  ]
};

const fedorJson = {
  leads: [
    { name: "Завод Б", website: "https://b.ru", email: "info@b.ru", city: "СПб", dedupe_key: "domain:b.ru" }
  ]
};

const artemJson = {
  hot_leads: [
    {
      title: "Ищут подрядчика по CRM",
      url: "https://vk.com/wall-1_2",
      hot_reasons: ["ищут подрядчика по CRM"],
      proof_refs: [0]
    }
  ],
  meta: { proof_items: [{ url: "https://vk.com/wall-1_2" }] }
};

const leonidJson = {
  dm_pack: {
    messages: {
      first_message: {
        text: "DM \"текст\", строка\n2",
        personalization_line: "много отзывов о доставке",
        grounding_refs: [1]
      }
    }
  }
};

const emelyanJson = {
  email_sequences: [
    {
      sequence_name: "короткая",
      emails: [
        {
          day_offset: 0,
          subject: "Тема",
          body: "Тело письма",
          bullets: [],
          grounding_refs: [2]
        }
      ]
    }
  ]
};

test("boris builds table and csv", async () => {
  const envelope = await generateBorisOutput({
    inputs: {
      maxim_leads_json: maximJson,
      fedor_leads_json: fedorJson,
      artem_hot_json: artemJson,
      leonid_dm_json: leonidJson,
      emelyan_email_json: emelyanJson
    },
    defaults: { max_items: 5 },
    primary_channel: "mixed"
  });
  const output = unwrapData(envelope);

  assert.ok(output.bdr_table.length > 0, "bdr_table not empty");
  const keys = new Set(output.bdr_table.map((row) => row.dedupe_key));
  assert.equal(keys.size, output.bdr_table.length, "dedupe_key unique");

  const csv = output.meta.export_helpers.csv;
  assert.ok(csv.startsWith("lead_id"), "csv header present");
  assert.ok(output.meta.export_helpers.columns.includes("subject"), "subject column present");
  assert.ok(output.meta.export_helpers.columns.includes("body"), "body column present");
  output.meta.export_helpers.columns.forEach((col) => {
    assert.ok(csv.includes(col), `csv contains column ${col}`);
  });
  assert.ok(csv.includes("\"DM \"\"текст\"\", строка"), "csv escaping quotes/commas/newlines");

  output.bdr_table.forEach((row) => {
    assert.ok(/\d{4}-\d{2}-\d{2}/.test(row.next_followup_date), "date format");
    assert.ok(typeof row.batch_key === "string" && row.batch_key.length > 0, "batch_key present");
    assert.ok(Array.isArray(row.followup_templates), "followup_templates array");
    assert.ok(row.followup_templates.length >= 1, "followups present");
    assert.ok(typeof row.next_step_reason === "string", "next_step_reason");
  });
  assert.ok(output.meta.status_transition_rules, "status_transition_rules");
});

test("email subject present for email channel", async () => {
  const envelope = await generateBorisOutput({
    inputs: {
      fedor_leads_json: fedorJson,
      emelyan_email_json: emelyanJson
    },
    primary_channel: "email"
  });
  const output = unwrapData(envelope);
  const emailRow = output.bdr_table.find((row) => row.channel === "EMAIL");
  assert.ok(emailRow, "email row exists");
  assert.ok(emailRow.subject && emailRow.subject.length > 0, "subject present");
});

test("needsReview true when no texts", async () => {
  const envelope = await generateBorisOutput({
    inputs: { maxim_leads_json: maximJson },
    defaults: { max_items: 1 }
  });
  const output = unwrapData(envelope);
  assert.equal(output.bdr_table[0].needsReview, true, "needsReview true");
  assert.ok(output.bdr_table.length <= 1, "max_items respected");
});

test("supports legacy flat dm and email payloads", async () => {
  const envelope = await generateBorisOutput({
    inputs: {
      maxim_leads_json: { data: { leads: maximJson.leads } },
      leonid_dm_json: { message: "Плоское DM сообщение" },
      emelyan_email_json: { subject: "Старая тема", body: "Старый body" }
    },
    defaults: { max_items: 1 },
    primary_channel: "email"
  });
  const output = unwrapData(envelope);
  assert.equal(output.bdr_table.length, 1, "one row built");
  const row = output.bdr_table[0];
  assert.equal(row.channel, "EMAIL");
  assert.equal(row.subject, "Старая тема");
  assert.equal(row.body, "Старый body");
});
