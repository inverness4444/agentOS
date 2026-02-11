const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("landing includes board section in shared department style", () => {
  const homePath = path.join(__dirname, "..", "app", "page.tsx");
  const homeSource = fs.readFileSync(homePath, "utf8");
  assert.ok(homeSource.includes("departments.map"), "home renders departments via shared component");
  assert.ok(!homeSource.includes("BoardFeatureSection"), "legacy custom board section is removed");

  const dataPath = path.join(__dirname, "..", "lib", "data.ts");
  const dataSource = fs.readFileSync(dataPath, "utf8");

  assert.ok(dataSource.includes('id: "board"'), "board department is present");
  assert.ok(dataSource.includes('title: "Совет директоров"'), "board title is present");
  assert.ok(
    dataSource.includes("3 позиции + итоговое решение. Жёстко и по делу"),
    "subtitle is present"
  );
  assert.ok(dataSource.includes('name: "Антон"'), "ceo card data is present");
  assert.ok(dataSource.includes('name: "Юрий"'), "cto card data is present");
  assert.ok(dataSource.includes('name: "София"'), "cfo card data is present");
  assert.ok(dataSource.includes('name: "Илья"'), "chairman card data is present");
  assert.ok(dataSource.includes("board: 0"), "board has highest landing priority");
  assert.ok(dataSource.includes('included: []'), "board extra included rows are disabled");

  const headerPath = path.join(__dirname, "..", "components", "Header.tsx");
  const headerSource = fs.readFileSync(headerPath, "utf8");
  assert.ok(headerSource.includes('href="#board"'), "top nav contains board anchor");
});
