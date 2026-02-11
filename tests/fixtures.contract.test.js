const test = require("node:test");
const assert = require("node:assert/strict");
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
const boardCeo = require("../lib/agents/boardCeo");
const boardCto = require("../lib/agents/boardCto");
const boardCfo = require("../lib/agents/boardCfo");
const boardChair = require("../lib/agents/boardChair");

const fixturesRoot = path.join(__dirname, "..", "fixtures", "agents");

const runners = {
  "platon-prospect-research-ru": platon.generatePlatonOutput,
  "anatoly-account-research-ru": anatoly.generateAnatolyOutput,
  "timofey-competitor-analysis-ru": timofey.generateTimofeyOutput,
  "maxim-local-leads-ru": maxim.generateMaximOutput,
  "fedor-b2b-leads-ru": fedor.generateFedorOutput,
  "artem-hot-leads-ru": artem.generateArtemOutput,
  "leonid-outreach-dm-ru": leonid.generateLeonidOutput,
  "emelyan-cold-email-ru": emelyan.generateEmelyanOutput,
  "boris-bdr-operator-ru": boris.generateBorisOutput,
  "pavel-reels-analysis-ru": pavel.generatePavelOutput,
  "trofim-shorts-analogs-ru": trofim.generateTrofimOutput,
  "irina-content-ideation-ru": irina.generateIrinaOutput,
  "hariton-viral-hooks-ru": hariton.generateHaritonOutput,
  "kostya-image-generation-ru": kostya.generateKostyaOutput,
  "seva-content-repurposing-ru": seva.generateSevaOutput,
  "mitya-workflow-diagram-ru": mitya.generateMityaOutput,
  "board-ceo-ru": boardCeo.generateBoardCeoOutput,
  "board-cto-ru": boardCto.generateBoardCtoOutput,
  "board-cfo-ru": boardCfo.generateBoardCfoOutput,
  "board-chair-ru": boardChair.generateBoardChairOutput
};

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const sanitizeVolatile = (payload) => {
  const clone = JSON.parse(JSON.stringify(payload));
  const strip = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(strip);
      return;
    }
    delete obj.generated_at;
    delete obj.run_id;
    delete obj.trace_id;
    delete obj.duration_ms;
    Object.values(obj).forEach(strip);
  };
  strip(clone);
  return clone;
};

const dataKeys = (data) => Object.keys(data || {}).sort();

test("fixtures match stable envelope contract", async () => {
  const agentIds = fs
    .readdirSync(fixturesRoot)
    .filter((entry) => fs.statSync(path.join(fixturesRoot, entry)).isDirectory());

  for (const agentId of agentIds) {
    const runner = runners[agentId];
    assert.ok(runner, `${agentId} runner exists`);
    const input = loadJson(path.join(fixturesRoot, agentId, "input.json"));
    const expected = sanitizeVolatile(
      loadJson(path.join(fixturesRoot, agentId, "output.json"))
    );
    const actualRaw = await runner(input, {});
    const actual = sanitizeVolatile(actualRaw);

    assert.ok(actual && actual.data && actual.meta, `${agentId} envelope`);
    assert.equal(actual.meta.quality_checks.schema_valid, true, `${agentId} schema_valid`);
    assert.ok(actual.meta.handoff, `${agentId} handoff`);
    assert.equal(actual.meta.handoff.type, expected.meta.handoff.type, `${agentId} handoff type`);
    assert.equal(
      actual.meta.handoff.version,
      expected.meta.handoff.version,
      `${agentId} handoff version`
    );
    assert.deepEqual(
      actual.meta.handoff.compat,
      expected.meta.handoff.compat,
      `${agentId} handoff compat`
    );
    assert.deepEqual(dataKeys(actual.data), dataKeys(expected.data), `${agentId} data keys`);
  }
});
