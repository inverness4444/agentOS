const test = require("node:test");
const assert = require("node:assert/strict");
const { __testOnly } = require("../lib/agents/chatStore.js");

test("company_analysis user-facing output hides internal telemetry and keeps normalized primary url", () => {
  const payload = {
    data: {
      account_card: {
        company_name: "QuadrantStress",
        primary_url: "https://quadrantstress.ru/",
        discovered_channels: {
          website: "https://quadrantstress.ru/",
          telegram: ["https://t.me/quadrantstress"]
        },
        what_they_sell: "Пульс-опросы сотрудников по стрессу",
        who_they_sell_to: "hypothesis: HRD/People Ops компаний 50-1000 сотрудников",
        avg_check_estimate: {
          value_range_rub: "unknown",
          estimate: true,
          estimate_basis: "unknown_no_public_prices",
          proof_refs: []
        },
        quick_audit_checklist: [
          {
            check: "Есть сайт",
            status: "PASS",
            detail: "Главная доступна, оффер читается.",
            source_url: "https://quadrantstress.ru/",
            proof_refs: [0]
          }
        ],
        top_personalization_hooks: [
          {
            hook_text: "На сайте есть форма заявки для демо.",
            source_url: "https://quadrantstress.ru/"
          }
        ],
        pain_hypotheses: [
          {
            statement: "Долгий цикл обработки обратной связи → ручные процессы → автоматизация AgentOS → нужна проверка SLA"
          }
        ],
        quick_wins: ["Настроить SLA по ответам"],
        public_contacts: { email: "hello@quadrantstress.ru", phone: "", messengers: ["telegram"], widgets: [] },
        contactability: { has_email: true, has_phone: false, has_messenger: true, has_widget: false, score_0_10: 5, estimate_basis: "based_on_signals" },
        best_channel_to_reach: "TG",
        needsReview: false
      },
      meta: {
        target_domain: "quadrantstress.ru",
        user_facing_sources: ["https://quadrantstress.ru/", "https://quadrantstress.ru/pricing"],
        official_channels: ["https://t.me/quadrantstress"],
        web_stats: {
          requests_made: 19,
          blocked_count: 4,
          errors_count: 2,
          trace_summary: { "quadrantstress.ru:page": 6 }
        },
        seed_urls: ["https://quadrantstress.ru/", "https://wikipedia.org/wiki/Stress"],
        proof_items: [
          {
            url: "https://quadrantstress.ru/",
            signal_type: "offer",
            signal_value: "Пульс-опросы",
            evidence_snippet: "Пульс-опросы по стрессу для сотрудников"
          }
        ],
        limitations: ["Тарифы не найдены на сайте"],
        assumptions: ["who_they_sell_to inference"]
      }
    }
  };

  const rendered = __testOnly.formatOutput(payload, {
    agentName: "Мария — Разбор компании",
    userPrompt: "разобрать мой сайт https://quadrantstress.ru/"
  });

  const banned = [
    "requests made",
    "trace",
    "blocked count",
    "errors count",
    "seed urls",
    "proof refs",
    "...ещё",
    "ещё полей"
  ];
  banned.forEach((marker) => {
    assert.equal(rendered.toLowerCase().includes(marker), false, `marker "${marker}" must be hidden`);
  });

  assert.ok(!/Краткое резюме|OUTPUT:|Основная часть/i.test(rendered), "no machine sections in chat");
  assert.match(rendered, /https:\/\/quadrantstress\.ru\//i, "target url is preserved in user-facing output");
  assert.equal(rendered.includes("wikipedia.org"), false, "external noisy domain removed from user-facing sources");
  assert.equal(rendered.toLowerCase().includes("requests made"), false, "debug telemetry hidden");
});
