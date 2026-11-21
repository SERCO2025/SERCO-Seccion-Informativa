"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSourceMetadata } = require("../src/services/editor/source-metadata");

test("conserva metadatos de fuente como el orden original de cita", () => {
  const metadata = { citation_order: 2, provider: "tavily", score: 0.91 };
  assert.deepEqual(normalizeSourceMetadata(metadata), metadata);
  assert.notEqual(normalizeSourceMetadata(metadata), metadata);
});

test("rechaza estructuras que no son objetos JSON de metadatos", () => {
  assert.deepEqual(normalizeSourceMetadata(null), {});
  assert.deepEqual(normalizeSourceMetadata("invalid"), {});
  assert.deepEqual(normalizeSourceMetadata([1, 2]), {});
});
