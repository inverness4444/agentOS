const test = require("node:test");
const assert = require("node:assert/strict");
const { generateAnatolyOutput } = require("../lib/agents/anatoly");
const { unwrapData } = require("./helpers");

const createMockWebClient = () => {
  const trace = [];
  return {
    search: async (query, engine, limit) => {
      const results = [];
      if (query.includes("сайт")) {
        results.push({ url: "https://example.com" });
      }
      if (query.includes("WB")) {
        results.push({ url: "https://wildberries.ru/brand/123" });
      }
      if (query.includes("отзывы")) {
        results.push({ url: "https://yandex.ru/maps/org/123" });
      }
      if (query.includes("VK")) {
        results.push({ url: "https://vk.com/examplebrand" });
      }
      return results.slice(0, limit).map((item) => ({
        ...item,
        title: "Result",
        snippet: query,
        query,
        engine,
        source_url: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
      }));
    },
    fetchPage: async (url) => {
      let html = "";
      let text = "";
      let title = "";
      if (url.includes("example.com")) {
        title = "Компания Пример — доставка кофе";
        html = "<html><title>Компания Пример — доставка кофе</title><form></form>contact@example.com https://t.me/examplebrand</html>";
        text = "Компания Пример доставка кофе для бизнеса. Контакты: +7 999 111-22-33";
      } else if (url.includes("wildberries")) {
        title = "Пример бренд";
        text = "350 отзывов рейтинг 4.4 120 товаров";
      } else if (url.includes("yandex.ru/maps")) {
        title = "Пример кофе";
        text = "Отзывов 120 рейтинг 4.2 есть жалобы на доставку";
      } else if (url.includes("vk.com")) {
        title = "VK Пример";
        text = "5000 подписчиков 12 постов";
      }
      trace.push({ domain: new URL(url).hostname, type: "page" });
      return { url, title, html, text };
    },
    getStats: () => ({
      requests_made: 10,
      blocked_count: 0,
      errors_count: 0,
      duration_ms: 50,
      top_errors: [],
      warnings: []
    }),
    getTrace: () => trace
  };
};

const createBlockedWebClient = () => ({
  search: async () => [{ url: "https://example.com" }],
  fetchPage: async (url) => ({ blocked: true, url }),
  getStats: () => ({
    requests_made: 3,
    blocked_count: 3,
    errors_count: 0,
    duration_ms: 50,
    top_errors: [],
    warnings: []
  }),
  getTrace: () => []
});

test("empty input asks for clarification and returns safe baseline", async () => {
  const envelope = await generateAnatolyOutput({}, { webClient: createMockWebClient() });
  const output = unwrapData(envelope);
  assert.ok(
    output.meta.limitations.some((item) => item.includes("пришлите ссылку")),
    "should ask for clarification"
  );
  assert.equal(output.account_card.needsReview, true, "needsReview true");
  assert.ok(
    Array.isArray(output.account_card.quick_audit_checklist) &&
      output.account_card.quick_audit_checklist.length >= 8,
    "safe checklist should be present"
  );
});

test("anatoly checklist, hooks and hypotheses are practical and grounded", async () => {
  const envelope = await generateAnatolyOutput(
    { company_name: "Пример", geo: "Москва" },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);

  output.meta.proof_items.forEach((item) => {
    assert.ok(item.evidence_snippet.length <= 160, "snippet <= 160");
    assert.equal(/<[^>]+>/.test(item.evidence_snippet), false, "no html");
  });

  const checklist = output.account_card.quick_audit_checklist;
  assert.ok(checklist.length >= 8 && checklist.length <= 12, "checklist length 8-12");
  checklist.forEach((item) => {
    assert.ok(["PASS", "WARN", "FAIL"].includes(item.status), "status PASS/WARN/FAIL");
    assert.ok(Array.isArray(item.proof_refs), "proof_refs required");
  });

  assert.ok(
    output.account_card.top_personalization_hooks.length >= 3 &&
      output.account_card.top_personalization_hooks.length <= 5,
    "hooks length 3-5"
  );
  output.account_card.top_personalization_hooks.forEach((hook) => {
    assert.ok(/Источник:/.test(hook.hook_text), "hook should include source link");
    assert.ok(hook.related_proofs.length > 0, "hook has related proofs");
  });

  assert.equal(output.account_card.pain_hypotheses.length, 3, "3 hypotheses");
  output.account_card.pain_hypotheses.forEach((hyp) => {
    assert.ok(typeof hyp.statement === "string" && hyp.statement.includes("→"), "required format");
    assert.ok(hyp.statement.includes("(AgentOS)"), "mini-solution should mention AgentOS");
  });
});

test("contactability and best_channel_to_reach are fact-based", async () => {
  const envelope = await generateAnatolyOutput(
    { company_name: "Пример", geo: "Москва" },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);
  const contactability = output.account_card.contactability;

  assert.ok(contactability.score_0_10 >= 0 && contactability.score_0_10 <= 10, "score 0-10");
  assert.ok(contactability.estimate_basis, "contactability should declare basis");
  assert.ok(["", "TG", "VK", "WA", "email"].includes(output.account_card.best_channel_to_reach));

  if (output.account_card.public_contacts.email) {
    assert.notEqual(output.account_card.best_channel_to_reach, "", "best channel should be set when facts exist");
  }
});

test("estimates are marked as estimate/based_on_signals", async () => {
  const envelope = await generateAnatolyOutput(
    { company_name: "Пример", geo: "Москва" },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);

  assert.equal(output.account_card.avg_check_estimate.estimate, true, "avg_check_estimate should be estimate");
  assert.ok(output.account_card.avg_check_estimate.estimate_basis, "estimate_basis required");
  assert.ok(output.account_card.contactability.estimate_basis, "contactability should have estimate_basis");
});

test("blocked sources keep needsReview with safe baseline", async () => {
  const envelope = await generateAnatolyOutput(
    { company_name: "Blocked" },
    { webClient: createBlockedWebClient() }
  );
  const output = unwrapData(envelope);
  assert.equal(output.account_card.needsReview, true, "needsReview true");
  assert.ok(output.meta.limitations.length > 0, "limitations filled");
  assert.ok(output.account_card.quick_audit_checklist.length >= 8, "safe baseline checklist present");
});
