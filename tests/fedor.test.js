const test = require("node:test");
const assert = require("node:assert/strict");
const { generateFedorOutput } = require("../lib/agents/fedor");
const { unwrapData } = require("./helpers");

const createMockWebClient = () => {
  const trace = [];
  return {
    search: async (query, engine, limit) => {
      return [
        { url: "https://catalog.example.ru/list" },
        { url: "https://association.example.ru/members" }
      ]
        .slice(0, limit)
        .map((item) => ({
          ...item,
          title: "Result",
          snippet: query,
          query,
          engine,
          source_url: `https://yandex.ru/search/?text=${encodeURIComponent(query)}`
        }));
    },
    fetchPage: async (url) => {
      trace.push({ domain: new URL(url).hostname, type: url.includes("company") ? "company" : "list" });
      if (url.includes("catalog.example.ru")) {
        return {
          url,
          title: "Каталог логистики",
          html:
            "<html><a href='https://company-a.ru'>A</a><a href='https://company-b.ru'>B</a></html>",
          text: "Каталог логистики"
        };
      }
      if (url.includes("association.example.ru")) {
        return {
          url,
          title: "Ассоциация участников",
          html: "<html><a href='https://company-a.ru'>A</a></html>",
          text: "Ассоциация участников"
        };
      }
      if (url.includes("company-a.ru")) {
        return {
          url,
          title: "Компания А — логистика",
          html: "<html><title>Компания А</title><div>ИНН 1234567890</div></html>",
          text:
            "Компания А логистика ИНН 1234567890 ОГРН 1234567890123 +7 999 123-45-67 info@CompanyA.RU https://company-a.ru филиал 4 сотрудников 120 услуги: складская логистика, фулфилмент вакансии ISO 9001"
        };
      }
      return {
        url,
        title: "Компания Б — производство",
        html: "<html><title>Компания Б</title></html>",
        text: "Компания Б производство +7 888 222-33-44 форма заявки vk.com/companyb"
      };
    },
    getStats: () => ({
      requests_made: 6,
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
  search: async () => [{ url: "https://blocked.example.ru/list" }],
  fetchPage: async (url) => ({ blocked: true, url }),
  getStats: () => ({
    requests_made: 2,
    blocked_count: 2,
    errors_count: 0,
    duration_ms: 20,
    top_errors: [],
    warnings: []
  }),
  getTrace: () => []
});

test("fedor output basics and normalization", async () => {
  const envelope = await generateFedorOutput(
    { industries: ["логистика"], mode: "quick" },
    { webClient: createMockWebClient() }
  );
  const output = unwrapData(envelope);

  assert.ok(Array.isArray(output.leads), "leads array");
  assert.ok(output.leads.length > 0, "has leads");

  output.meta.proof_items.forEach((item) => {
    assert.ok(item.evidence_snippet.length <= 160, "snippet <= 160");
    assert.equal(/<[^>]+>/.test(item.evidence_snippet), false, "no html");
  });

  const lead = output.leads[0];
  assert.ok(lead.phone && lead.phone.startsWith("+7"), "phone normalized");
  if (lead.email) {
    assert.equal(lead.email, lead.email.toLowerCase(), "email lowercase");
  }
  assert.ok(lead.domain && !lead.domain.startsWith("www."), "domain normalized");
  assert.ok(lead.dedupe_key.startsWith("inn:"), "prefer_inn used for dedupe_key");
  assert.ok(lead.size_signals && typeof lead.size_signals === "object", "size_signals object");
  [
    "employees",
    "revenue",
    "regions",
    "branches",
    "facilities",
    "hiring",
    "certifications"
  ].forEach((field) => {
    assert.ok(lead.size_signals[field], `size_signals.${field}`);
    assert.equal(typeof lead.size_signals[field].unknown, "boolean", `${field}.unknown bool`);
  });
  assert.ok(
    Array.isArray(lead.industry_fit_tags) &&
      lead.industry_fit_tags.length >= 1 &&
      lead.industry_fit_tags.length <= 7,
    "industry_fit_tags 1..7"
  );
  assert.ok(Array.isArray(lead.service_keywords), "service_keywords array");
  assert.ok(typeof lead.dedupe_explain === "string" && lead.dedupe_explain.length > 0, "dedupe_explain");
  assert.ok(["email", "form", "phone", "tg", "vk", "unknown"].includes(lead.contact_priority));
  assert.ok(output.meta.dedupe_report, "meta.dedupe_report exists");
  assert.ok(output.meta.dedupe_report.scanned_total >= output.meta.dedupe_report.kept_total);
  ["removed_by_inn", "removed_by_domain", "removed_by_phone", "removed_by_name_city"].forEach((k) => {
    assert.equal(typeof output.meta.dedupe_report[k], "number", `${k} numeric`);
  });
  assert.equal(output.meta.quality_checks.no_gray_scraping, true, "no_gray_scraping true");
});

test("blocked sources add limitations", async () => {
  const envelope = await generateFedorOutput(
    { industries: ["логистика"] },
    { webClient: createBlockedWebClient() }
  );
  const output = unwrapData(envelope);
  assert.ok(output.meta.limitations.length > 0, "limitations filled");
});
