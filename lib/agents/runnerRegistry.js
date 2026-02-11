const platon = require("./platon.js");
const anatoly = require("./anatoly.js");
const timofey = require("./timofey.js");
const maxim = require("./maxim.js");
const fedor = require("./fedor.js");
const artem = require("./artem.js");
const leonid = require("./leonid.js");
const emelyan = require("./emelyan.js");
const boris = require("./boris.js");
const pavel = require("./pavel.js");
const trofim = require("./trofim.js");
const irina = require("./irina.js");
const hariton = require("./hariton.js");
const kostya = require("./kostya.js");
const seva = require("./seva.js");
const mitya = require("./mitya.js");

const runners = [
  {
    registryId: "platon",
    agentId: platon.platonAgent.id,
    displayName: platon.platonAgent.displayName,
    systemPrompt: platon.systemPrompt,
    outputSchema: platon.outputSchema,
    isWeb: true,
    run: platon.generatePlatonOutput
  },
  {
    registryId: "anatoly",
    agentId: anatoly.anatolyAgent.id,
    displayName: anatoly.anatolyAgent.displayName,
    systemPrompt: anatoly.systemPrompt,
    outputSchema: anatoly.outputSchema,
    isWeb: true,
    run: anatoly.generateAnatolyOutput
  },
  {
    registryId: "timofey-competitor-analysis-ru",
    agentId: timofey.timofeyAgent.id,
    displayName: timofey.timofeyAgent.displayName,
    systemPrompt: timofey.systemPrompt,
    outputSchema: timofey.outputSchema,
    isWeb: true,
    run: timofey.generateTimofeyOutput
  },
  {
    registryId: "maxim",
    agentId: maxim.maximAgent.id,
    displayName: maxim.maximAgent.displayName,
    systemPrompt: maxim.systemPrompt,
    outputSchema: maxim.outputSchema,
    isWeb: true,
    run: maxim.generateMaximOutput
  },
  {
    registryId: "fedor-b2b-leads-ru",
    agentId: fedor.fedorAgent.id,
    displayName: fedor.fedorAgent.displayName,
    systemPrompt: fedor.systemPrompt,
    outputSchema: fedor.outputSchema,
    isWeb: true,
    run: fedor.generateFedorOutput
  },
  {
    registryId: "artem-hot-leads-ru",
    agentId: artem.artemAgent.id,
    displayName: artem.artemAgent.displayName,
    systemPrompt: artem.systemPrompt,
    outputSchema: artem.outputSchema,
    isWeb: true,
    run: artem.generateArtemOutput
  },
  {
    registryId: "leonid-outreach-dm-ru",
    agentId: leonid.leonidAgent.id,
    displayName: leonid.leonidAgent.displayName,
    systemPrompt: leonid.systemPrompt,
    outputSchema: leonid.outputSchema,
    isWeb: false,
    run: leonid.generateLeonidOutput
  },
  {
    registryId: "emelyan-cold-email-ru",
    agentId: emelyan.emelyanAgent.id,
    displayName: emelyan.emelyanAgent.displayName,
    systemPrompt: emelyan.systemPrompt,
    outputSchema: emelyan.outputSchema,
    isWeb: false,
    run: emelyan.generateEmelyanOutput
  },
  {
    registryId: "boris-bdr-operator-ru",
    agentId: boris.borisAgent.id,
    displayName: boris.borisAgent.displayName,
    systemPrompt: boris.systemPrompt,
    outputSchema: boris.outputSchema,
    isWeb: false,
    run: boris.generateBorisOutput
  },
  {
    registryId: "pavel-reels-analysis-ru",
    agentId: pavel.pavelAgent.id,
    displayName: pavel.pavelAgent.displayName,
    systemPrompt: pavel.systemPrompt,
    outputSchema: pavel.outputSchema,
    isWeb: false,
    run: pavel.generatePavelOutput
  },
  {
    registryId: "trofim-shorts-analogs-ru",
    agentId: trofim.trofimAgent.id,
    displayName: trofim.trofimAgent.displayName,
    systemPrompt: trofim.systemPrompt,
    outputSchema: trofim.outputSchema,
    isWeb: false,
    run: trofim.generateTrofimOutput
  },
  {
    registryId: "irina-content-ideation-ru",
    agentId: irina.irinaAgent.id,
    displayName: irina.irinaAgent.displayName,
    systemPrompt: irina.systemPrompt,
    outputSchema: irina.outputSchema,
    isWeb: false,
    run: irina.generateIrinaOutput
  },
  {
    registryId: "hariton-viral-hooks-ru",
    agentId: hariton.haritonAgent.id,
    displayName: hariton.haritonAgent.displayName,
    systemPrompt: hariton.systemPrompt,
    outputSchema: hariton.outputSchema,
    isWeb: false,
    run: hariton.generateHaritonOutput
  },
  {
    registryId: "kostya-image-generation-ru",
    agentId: kostya.kostyaAgent.id,
    displayName: kostya.kostyaAgent.displayName,
    systemPrompt: kostya.systemPrompt,
    outputSchema: kostya.outputSchema,
    isWeb: false,
    run: kostya.generateKostyaOutput
  },
  {
    registryId: "seva-content-repurposing-ru",
    agentId: seva.sevaAgent.id,
    displayName: seva.sevaAgent.displayName,
    systemPrompt: seva.systemPrompt,
    outputSchema: seva.outputSchema,
    isWeb: false,
    run: seva.generateSevaOutput
  },
  {
    registryId: "mitya-workflow-diagram-ru",
    agentId: mitya.mityaAgent.id,
    displayName: mitya.mityaAgent.displayName,
    systemPrompt: mitya.systemPrompt,
    outputSchema: mitya.outputSchema,
    isWeb: false,
    run: mitya.generateMityaOutput
  }
];

const byRegistryId = new Map(runners.map((item) => [item.registryId, item]));
const byAgentId = new Map(runners.map((item) => [item.agentId, item]));

const listAgentRunners = () => runners.slice();
const getRunnerByRegistryId = (id) => byRegistryId.get(id) || null;
const getRunnerByAgentId = (id) => byAgentId.get(id) || null;

module.exports = {
  listAgentRunners,
  getRunnerByRegistryId,
  getRunnerByAgentId
};
