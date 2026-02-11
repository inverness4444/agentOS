const fs = require("node:fs");
const path = require("node:path");

const platon = require("../lib/agents/platon");
const anatoly = require("../lib/agents/anatoly");
const timofey = require("../lib/agents/timofey");
const maxim = require("../lib/agents/maxim");
const fedor = require("../lib/agents/fedor");
const artem = require("../lib/agents/artem");
const leonid = require("../lib/agents/leonid");
const emelyan = require("../lib/agents/emelyan");
const boris = require("../lib/agents/boris");
const pavel = require("../lib/agents/pavel");
const trofim = require("../lib/agents/trofim");
const irina = require("../lib/agents/irina");
const hariton = require("../lib/agents/hariton");
const kostya = require("../lib/agents/kostya");
const seva = require("../lib/agents/seva");
const mitya = require("../lib/agents/mitya");

const fixturesRoot = path.join(__dirname, "..", "fixtures", "agents");

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const now = new Date().toISOString();

const compatLeadsTable = [
  "anatoly-account-research-ru",
  "leonid-outreach-dm-ru",
  "emelyan-cold-email-ru",
  "boris-bdr-operator-ru"
];

const borisInputEnvelope = {
  data: {
    leads: [
      {
        name: "Test Lead",
        website: "https://example.com",
        phone: "+7 900 000-00-00",
        city: "Москва",
        category: "SaaS",
        dedupe_key: "domain:example.com",
        source: "yandex",
        proof_refs: []
      }
    ],
    meta: { generated_at: now }
  },
  meta: {
    agent_id: "maxim-local-leads-ru",
    generated_at: now,
    run_id: "fixture",
    mode: "quick",
    input_echo: {},
    quality_checks: {
      no_fabrication: true,
      within_limits: true,
      schema_valid: true,
      dedupe_ok: true,
      grounding_ok: true
    },
    limitations: [],
    assumptions: [],
    handoff: {
      type: "leads_table",
      version: "1.0",
      entities: { leads: [] },
      recommended_next_agents: [],
      compat: compatLeadsTable
    },
    web_stats: null
  }
};

const fixtures = [
  {
    id: "platon-prospect-research-ru",
    runner: platon.generatePlatonOutput,
    input: {
      mode: "quick",
      has_web_access: false,
      allow_placeholders_if_no_web: true,
      industry_or_niche: "маркетплейсы",
      geo: "Москва",
      target_count: 5,
      min_confidence: 40
    }
  },
  {
    id: "anatoly-account-research-ru",
    runner: anatoly.generateAnatolyOutput,
    input: { mode: "quick", has_web_access: false, company_name: "Тестовая компания" }
  },
  {
    id: "timofey-competitor-analysis-ru",
    runner: timofey.generateTimofeyOutput,
    input: { mode: "quick", has_web_access: false, niche_hint: "CRM" }
  },
  {
    id: "maxim-local-leads-ru",
    runner: maxim.generateMaximOutput,
    input: {
      mode: "quick",
      has_web_access: false,
      query: "стоматология",
      geo: "Москва",
      target_count: 3
    }
  },
  {
    id: "fedor-b2b-leads-ru",
    runner: fedor.generateFedorOutput,
    input: { mode: "quick", has_web_access: false, industries: ["логистика"], target_count: 3 }
  },
  {
    id: "artem-hot-leads-ru",
    runner: artem.generateArtemOutput,
    input: { mode: "quick", has_web_access: false, focus: "crm", target_count: 3 }
  },
  {
    id: "leonid-outreach-dm-ru",
    runner: leonid.generateLeonidOutput,
    input: {
      channel: "telegram",
      anatoly_output_json: {
        account_card: {
          company_name: "Test Co",
          primary_url: "https://example.com",
          discovered_channels: { website: "https://example.com" },
          what_they_sell: "SaaS",
          who_they_sell_to: "B2B",
          avg_check_estimate: null,
          top_personalization_hooks: ["Сильный оффер"],
          pain_hypotheses: ["Долгие ответы клиентам"],
          quick_wins: ["Чат-бот"],
          public_contacts: {
            email: "info@example.com",
            phone: "+7 900 000-00-00",
            messengers: [],
            widgets: []
          }
        },
        meta: { proof_items: [] }
      }
    }
  },
  {
    id: "emelyan-cold-email-ru",
    runner: emelyan.generateEmelyanOutput,
    input: {
      anatoly_output_json: {
        account_card: {
          company_name: "Test Co",
          primary_url: "https://example.com",
          discovered_channels: { website: "https://example.com" },
          what_they_sell: "SaaS",
          who_they_sell_to: "B2B",
          avg_check_estimate: null,
          top_personalization_hooks: ["Сильный оффер"],
          pain_hypotheses: ["Долгие ответы клиентам"],
          quick_wins: ["Чат-бот"],
          public_contacts: {
            email: "info@example.com",
            phone: "+7 900 000-00-00",
            messengers: [],
            widgets: []
          }
        },
        meta: { proof_items: [] }
      }
    }
  },
  {
    id: "boris-bdr-operator-ru",
    runner: boris.generateBorisOutput,
    input: { inputs: { maxim_leads_json: borisInputEnvelope } }
  },
  {
    id: "pavel-reels-analysis-ru",
    runner: pavel.generatePavelOutput,
    input: {
      niche: "маркетплейсы",
      input_content: {
        transcript: "0–3: Покажу, как селлер теряет 30% продаж. 3–15: три ошибки карточки. 15–30: кейс и цифры. CTA: напиши «шаблон»."
      }
    }
  },
  {
    id: "trofim-shorts-analogs-ru",
    runner: trofim.generateTrofimOutput,
    input: {
      niche: "AgentOS/автоматизация",
      references: { themes: ["ошибка недели", "до/после"] }
    }
  },
  {
    id: "irina-content-ideation-ru",
    runner: irina.generateIrinaOutput,
    input: { niche: "AgentOS/автоматизация", goal: "leads" }
  },
  {
    id: "hariton-viral-hooks-ru",
    runner: hariton.generateHaritonOutput,
    input: {
      niche: "AgentOS/автоматизация",
      offer: { one_liner: "ИИ-агенты для обработки заявок за 7 дней" }
    }
  },
  {
    id: "kostya-image-generation-ru",
    runner: kostya.generateKostyaOutput,
    input: {
      niche: "AgentOS/автоматизация",
      content_inputs: { headline: "3 точки роста за 7 дней" }
    }
  },
  {
    id: "seva-content-repurposing-ru",
    runner: seva.generateSevaOutput,
    input: {
      niche: "AgentOS/автоматизация",
      source_asset: {
        text: "Кейс: снизили время ответа клиентам с 2 дней до 3 часов.",
        key_numbers: ["2 дня", "3 часа"]
      }
    }
  },
  {
    id: "mitya-workflow-diagram-ru",
    runner: mitya.generateMityaOutput,
    input: {
      diagram_type: "agentos_how_it_works",
      context: { product_one_liner: "AgentOS для автоматизации лидогенерации" }
    }
  }
];

const writeJson = (filePath, payload) => {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const run = async () => {
  ensureDir(fixturesRoot);
  for (const fixture of fixtures) {
    const dir = path.join(fixturesRoot, fixture.id);
    ensureDir(dir);
    const inputPath = path.join(dir, "input.json");
    const outputPath = path.join(dir, "output.json");
    writeJson(inputPath, fixture.input);
    const output = await fixture.runner(fixture.input, {});
    writeJson(outputPath, output);
  }
  console.log(`Updated ${fixtures.length} fixtures.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
