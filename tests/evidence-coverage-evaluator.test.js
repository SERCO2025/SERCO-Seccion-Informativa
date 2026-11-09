"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createEvidenceCoverageEvaluator, tokenize, tokensMatch } = require("../src/services/ai/evidence-coverage-evaluator");

const evaluator = createEvidenceCoverageEvaluator();

test("normaliza acentos y elimina palabras funcionales", () => {
  assert.deepEqual(tokenize("¿Qué tipos de cimentación existen?"), ["tipos", "cimentacion", "existen"]);
});

test("reconoce singular y plural por raíz conservadora", () => {
  assert.equal(tokensMatch("cimentacion", "cimentaciones"), true);
});

test("clasifica como suficiente cuando todos los términos de contenido están respaldados", async () => {
  const result = await evaluator.evaluate({
    question: "¿Qué tipos de cimentación existen?",
    evidence: [{ title: "Tipos de cimentaciones", section: "Clasificación", content: "La publicación explica los tipos de cimentaciones existentes." }]
  });
  assert.equal(result.status, "sufficient");
  assert.deepEqual(result.missingInformation, []);
});

test("clasifica como parcial cuando solo parte de los términos tiene respaldo", async () => {
  const result = await evaluator.evaluate({
    question: "¿Qué cimentación usar en terreno arcilloso?",
    evidence: [{ title: "Cimentaciones", content: "La publicación describe tipos de cimentación." }]
  });
  assert.equal(result.status, "partial");
  assert.ok(result.missingInformation.length > 0);
});

test("clasifica como insuficiente cuando no hay correspondencia léxica", async () => {
  const result = await evaluator.evaluate({
    question: "¿Qué resistencia tiene el acero inoxidable?",
    evidence: [{ title: "Tipos de cimentación", content: "Descripción de zapatas y losas." }]
  });
  assert.equal(result.status, "insufficient");
});
