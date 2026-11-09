"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");
const { createEvidenceCoverageEvaluator } = require("../src/services/ai/evidence-coverage-evaluator");
const { createConstructionSafetyGuard } = require("../src/services/ai/construction-safety-guard");

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function createPipeline(options = {}) {
  const evidence = options.evidence === undefined
    ? [{
        id: "chunk-lindero-001",
        articleId: "article-lindero-001",
        slug: "lindero",
        title: "Lindero",
        version: 1,
        section: "Definición",
        content: "Un lindero es la línea que delimita un predio respecto de los predios colindantes.",
        excerpt: "Un lindero es la línea que delimita un predio."
      }]
    : options.evidence;

  const orchestrator = createAskOrchestrator({
    retriever: {
      async search(input) {
        assert.equal(input.publicationStatus, "published");
        assert.equal(input.limit, 8);
        return { items: evidence };
      }
    },
    coverageEvaluator: createEvidenceCoverageEvaluator(),
    safetyGuard: createConstructionSafetyGuard(),
    answerGenerator: {
      async generate(input) {
        if (options.onGenerate) options.onGenerate(input);
        return {
          text: options.answer || "Un lindero delimita un predio respecto de los predios colindantes.",
          citationIds: [evidence[0].id]
        };
      }
    }
  });

  return createAskHttpHandler(orchestrator);
}

test("integra HTTP, recuperación, cobertura, seguridad, generación y cita verificada", async () => {
  const handler = createPipeline();
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "¿Qué es un lindero?" }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, "answered");
  assert.equal(res.payload.coverage, "sufficient");
  assert.equal(res.payload.citations[0].citationId, "chunk-lindero-001");
});

test("una cobertura parcial llega al generador con los datos faltantes", async () => {
  let receivedMissingInformation;
  const handler = createPipeline({
    evidence: [{
      id: "chunk-cimentacion-001",
      articleId: "article-cimentacion-001",
      slug: "cimentacion",
      title: "Cimentación",
      version: 1,
      section: "Introducción",
      content: "La cimentación transmite las cargas de una estructura al terreno."
    }],
    onGenerate(input) {
      receivedMissingInformation = input.missingInformation;
    },
    answer: "La publicación explica la función general de una cimentación."
  });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "¿Qué cimentación usar en terreno arcilloso?" }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, "partial");
  assert.ok(receivedMissingInformation.length > 0);
  assert.match(receivedMissingInformation.join(" "), /terreno|arcilloso|usar/);
});

test("una decisión estructural solicita aclaración antes de generar", async () => {
  let generated = false;
  const handler = createPipeline({
    evidence: [{
      id: "chunk-cimentacion-002",
      articleId: "article-cimentacion-002",
      slug: "cimentacion",
      title: "Cimentación",
      version: 1,
      section: "Introducción",
      content: "La cimentación transmite las cargas de una estructura al terreno."
    }],
    onGenerate() { generated = true; }
  });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "¿Qué cimentación debo usar para mi construcción?" }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, "needs_clarification");
  assert.ok(res.payload.clarificationQuestions.length >= 3);
  assert.equal(generated, false);
});

test("sin evidencia no se llama al generador y se declara insuficiencia", async () => {
  let generated = false;
  const handler = createPipeline({
    evidence: [],
    onGenerate() { generated = true; }
  });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "¿Qué es un lindero?" }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.coverage, "insufficient");
  assert.equal(res.payload.citations.length, 0);
  assert.equal(generated, false);
});
