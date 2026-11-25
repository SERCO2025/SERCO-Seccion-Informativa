"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("la interfaz informa que los resultados sources_only se guardan como expediente privado cuando la persistencia fue exitosa", () => {
  const source = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(source, /result\.persistence==="saved_partial_for_review"/);
  assert.match(source, /el expediente parcial quedó guardado de forma privada para revisión editorial/);
  assert.doesNotMatch(source, /no se guardaron como documento editorial/);
});
