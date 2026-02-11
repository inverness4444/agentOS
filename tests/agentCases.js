const { generatePlatonOutput } = require("../lib/agents/platon");
const { generateAnatolyOutput } = require("../lib/agents/anatoly");
const { generateTimofeyOutput } = require("../lib/agents/timofey");
const { generateMaximOutput } = require("../lib/agents/maxim");
const { generateFedorOutput } = require("../lib/agents/fedor");
const { generateArtemOutput } = require("../lib/agents/artem");
const { generateLeonidOutput } = require("../lib/agents/leonid");
const { generateEmelyanOutput } = require("../lib/agents/emelyan");
const { generateBorisOutput } = require("../lib/agents/boris");
const { generatePavelOutput } = require("../lib/agents/pavel");
const { generateTrofimOutput } = require("../lib/agents/trofim");
const { generateIrinaOutput } = require("../lib/agents/irina");
const { generateHaritonOutput } = require("../lib/agents/hariton");
const { generateKostyaOutput } = require("../lib/agents/kostya");
const { generateSevaOutput } = require("../lib/agents/seva");
const { generateMityaOutput } = require("../lib/agents/mitya");

const agentCases = [
  {
    id: "platon-prospect-research-ru",
    fn: generatePlatonOutput,
    input: { has_web_access: false, allow_placeholders_if_no_web: true, mode: "deep" }
  },
  {
    id: "anatoly-account-research-ru",
    fn: generateAnatolyOutput,
    input: { company_name: "Test", has_web_access: false }
  },
  {
    id: "timofey-competitor-analysis-ru",
    fn: generateTimofeyOutput,
    input: { has_web_access: false }
  },
  {
    id: "maxim-local-leads-ru",
    fn: generateMaximOutput,
    input: { query: "стоматология", geo: "Москва", has_web_access: false }
  },
  {
    id: "fedor-b2b-leads-ru",
    fn: generateFedorOutput,
    input: { industries: ["логистика"], has_web_access: false }
  },
  {
    id: "artem-hot-leads-ru",
    fn: generateArtemOutput,
    input: { focus: "crm", has_web_access: false }
  },
  {
    id: "leonid-outreach-dm-ru",
    fn: generateLeonidOutput,
    input: {}
  },
  {
    id: "emelyan-cold-email-ru",
    fn: generateEmelyanOutput,
    input: {}
  },
  {
    id: "boris-bdr-operator-ru",
    fn: generateBorisOutput,
    input: { inputs: { maxim_leads_json: { leads: [] } } }
  },
  {
    id: "pavel-reels-analysis-ru",
    fn: generatePavelOutput,
    input: {}
  },
  {
    id: "trofim-shorts-analogs-ru",
    fn: generateTrofimOutput,
    input: {}
  },
  {
    id: "irina-content-ideation-ru",
    fn: generateIrinaOutput,
    input: {}
  },
  {
    id: "hariton-viral-hooks-ru",
    fn: generateHaritonOutput,
    input: {}
  },
  {
    id: "kostya-image-generation-ru",
    fn: generateKostyaOutput,
    input: {}
  },
  {
    id: "seva-content-repurposing-ru",
    fn: generateSevaOutput,
    input: {}
  },
  {
    id: "mitya-workflow-diagram-ru",
    fn: generateMityaOutput,
    input: {}
  }
];

module.exports = { agentCases };
