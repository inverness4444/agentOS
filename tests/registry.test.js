const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("registry includes Fedor", () => {
  const registryPath = path.join(__dirname, "../lib/workflows/registry.ts");
  const contents = fs.readFileSync(registryPath, "utf8");
  const requiredIds = [
    "platon",
    "anatoly",
    "maxim",
    "emelyan-cold-email-ru",
    "timofey-competitor-analysis-ru",
    "fedor-b2b-leads-ru",
    "artem-hot-leads-ru",
    "leonid-outreach-dm-ru",
    "boris-bdr-operator-ru",
    "pavel-reels-analysis-ru",
    "trofim-shorts-analogs-ru",
    "irina-content-ideation-ru",
    "hariton-viral-hooks-ru",
    "kostya-image-generation-ru",
    "seva-content-repurposing-ru",
    "mitya-workflow-diagram-ru"
  ];
  requiredIds.forEach((id) => {
    assert.ok(contents.includes(id), `${id} present in registry`);
  });
});
