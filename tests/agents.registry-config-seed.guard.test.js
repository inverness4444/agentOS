const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { agentRegistry } = require("../lib/workflows/registry.js");

const toRegistryId = (id) => {
  const aliases = {
    "platon-prospect-research-ru": "platon",
    "anatoly-account-research-ru": "anatoly",
    "maxim-local-leads-ru": "maxim"
  };
  return aliases[id] || id;
};

const setDiff = (left, right) => [...left].filter((item) => !right.has(item));

const assertSetMatch = (labelA, setA, labelB, setB) => {
  const missingInB = setDiff(setA, setB);
  const missingInA = setDiff(setB, setA);
  const ok = missingInB.length === 0 && missingInA.length === 0;
  assert.ok(
    ok,
    `${labelA} vs ${labelB} mismatch\nmissing_in_${labelB}: ${missingInB.join(", ") || "-"}\nmissing_in_${labelA}: ${missingInA.join(", ") || "-"}`
  );
};

const configBranches = [
  {
    id: "platon",
    marker: 'if (name.includes("платон"))',
    displayName: "Платон — находит подходящие компании для продаж."
  },
  {
    id: "anatoly",
    marker: 'if (name.includes("мария") || name.includes("анатол"))',
    displayName: "Мария"
  },
  { id: "timofey-competitor-analysis-ru", marker: 'if (name.includes("тимофей"))', displayName: "Тимофей" },
  { id: "maxim", marker: 'if (name.includes("максим"))', displayName: "Максим" },
  {
    id: "fedor-b2b-leads-ru",
    marker: 'if (name.includes("фёдор") || name.includes("федор"))',
    displayName: "Фёдор"
  },
  {
    id: "artem-hot-leads-ru",
    marker: 'if (name.includes("артём") || name.includes("артем"))',
    displayName: "Артём"
  },
  { id: "leonid-outreach-dm-ru", marker: 'if (name.includes("леонид"))', displayName: "Леонид" },
  { id: "emelyan-cold-email-ru", marker: 'if (name.includes("емельян"))', displayName: "Емельян" },
  { id: "boris-bdr-operator-ru", marker: 'if (name.includes("борис"))', displayName: "Борис" },
  { id: "pavel-reels-analysis-ru", marker: 'if (name.includes("павел"))', displayName: "Павел" },
  { id: "trofim-shorts-analogs-ru", marker: 'if (name.includes("трофим"))', displayName: "Трофим" },
  { id: "irina-content-ideation-ru", marker: 'if (name.includes("ирина"))', displayName: "Ирина" },
  { id: "hariton-viral-hooks-ru", marker: 'if (name.includes("харитон"))', displayName: "Харитон" },
  { id: "kostya-image-generation-ru", marker: 'if (name.includes("костя"))', displayName: "Костя" },
  { id: "seva-content-repurposing-ru", marker: 'if (name.includes("сева"))', displayName: "Сева" },
  {
    id: "mitya-workflow-diagram-ru",
    marker: 'if (name.includes("анастас") || name.includes("митя"))',
    displayName: "Анастасия"
  }
];

test("registry/config/seed ids are consistent", () => {
  const registryIds = new Set(agentRegistry.map((item) => item.id));
  assert.equal(registryIds.size, 16, "registry should include 16 agents");
  agentRegistry.forEach((item) => {
    assert.ok(typeof item.name === "string" && item.name.trim().length > 0, `${item.id} displayName`);
  });

  const configPath = path.join(__dirname, "..", "lib", "agents", "config.ts");
  const configSource = fs.readFileSync(configPath, "utf8");
  const configIds = new Set();
  configBranches.forEach((branch) => {
    assert.ok(
      configSource.includes(branch.marker),
      `config.ts missing marker for ${branch.id}: ${branch.marker}`
    );
    assert.ok(branch.displayName && branch.displayName.trim().length > 0, `${branch.id} config displayName`);
    configIds.add(branch.id);
  });

  const routePath = path.join(__dirname, "..", "app", "api", "agents", "route.ts");
  const routeSource = fs.readFileSync(routePath, "utf8");
  const importMatches = [...routeSource.matchAll(/await import\("@\/lib\/agents\/([^"]+)"\)/g)];
  const slugs = Array.from(new Set(importMatches.map((match) => match[1])));

  const seedIds = new Set();
  slugs.forEach((slug) => {
    const mod = require(path.join(__dirname, "..", "lib", "agents", slug));
    const candidate = Object.values(mod).find(
      (value) =>
        value &&
        typeof value === "object" &&
        typeof value.id === "string" &&
        typeof value.displayName === "string"
    );

    assert.ok(candidate, `seed module ${slug} has agent object`);
    assert.ok(candidate.displayName.trim().length > 0, `seed module ${slug} displayName`);
    seedIds.add(toRegistryId(candidate.id));
  });

  assert.equal(seedIds.size, 16, "seed route should include 16 agents");

  assertSetMatch("registry", registryIds, "config", configIds);
  assertSetMatch("registry", registryIds, "seed", seedIds);
});
