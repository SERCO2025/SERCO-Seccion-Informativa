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

test("no combina coincidencias de publicaciones distintas para declarar cobertura suficiente", async () => {
  const result = await evaluator.evaluate({
    question: "¿Qué resistencia del acero inoxidable?",
    evidence: [
      {
        id: "chunk-resistencia",
        articleId: "article-resistencia",
        title: "Resistencia mecánica",
        content: "La resistencia mecánica depende de la composición."
      },
      {
        id: "chunk-acero",
        articleId: "article-acero",
        title: "Acero estructural",
        content: "El acero estructural se utiliza en construcción."
      },
      {
        id: "chunk-inoxidable",
        articleId: "article-inoxidable",
        title: "Material inoxidable",
        content: "El material inoxidable resiste la corrosión."
      }
    ]
  });

  assert.equal(result.status, "partial");
  assert.deepEqual(result.matchedTerms, ["resistencia"]);
  assert.ok(result.missingInformation.length > 0);
});

test("combina fragmentos de una misma publicación para evaluar su cobertura", async () => {
  const result = await evaluator.evaluate({
    question: "¿Qué resistencia del acero inoxidable?",
    evidence: [
      {
        id: "chunk-resistencia-1",
        articleId: "article-acero-inoxidable",
        title: "Resistencia mecánica",
        content: "La resistencia mecánica depende de la composición."
      },
      {
        id: "chunk-acero-2",
        articleId: "article-acero-inoxidable",
        title: "Acero estructural",
        content: "El acero estructural se utiliza en construcción."
      },
      {
        id: "chunk-inoxidable-3",
        articleId: "article-acero-inoxidable",
        title: "Material inoxidable",
        content: "El material inoxidable resiste la corrosión."
      }
    ]
  });

  assert.equal(result.status, "sufficient");
  assert.deepEqual(result.missingInformation, []);
});
