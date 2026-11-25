"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("el JavaScript del estudio editorial compila con el selector de biblioteca", () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/editor-studio.js"), "utf8");
  const match = source.match(/<script>\\s*([\\s\\S]*?)\\s*<\\/script>/i);
  assert.ok(match, "Debe existir el bloque JavaScript del estudio editorial");
  assert.doesNotThrow(() => new vm.Script(match[1]), "El JavaScript del estudio debe ser sintácticamente válido");
});

test("el endpoint de biblioteca y el preparador de cargas se pueden importar", () => {
  assert.equal(typeof require("../api/editor-media-library"), "function");
  assert.equal(typeof require("../api/editor-upload"), "function");
});
