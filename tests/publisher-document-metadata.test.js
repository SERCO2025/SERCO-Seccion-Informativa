"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizePublishedDate,
  createArticleSlug
} = require("../src/services/publisher/document-metadata");

test("normaliza fechas ISO válidas y rechaza fechas imposibles", () => {
  assert.equal(normalizePublishedDate("2026-11-23"), "2026-11-23");
  assert.equal(normalizePublishedDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizePublishedDate("2026-02-29"), null);
  assert.equal(normalizePublishedDate("2026-13-01"), null);
  assert.equal(normalizePublishedDate("23/11/2026"), null);
  assert.equal(normalizePublishedDate(""), null);
});

test("genera slugs legibles sin acentos ni caracteres sobrantes", () => {
  assert.equal(createArticleSlug("Construcción de cimentación y Muros"), "construccion-de-cimentacion-y-muros");
  assert.equal(createArticleSlug("Árbol, diseño y geotecnia"), "arbol-diseno-y-geotecnia");
  assert.equal(createArticleSlug("  Ingeniería civil  "), "ingenieria-civil");
  assert.equal(createArticleSlug(""), "");
});
