"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAskOrchestrator,
  validateQuestion,
  AskInputError,
  AskAdapterError
} = require("../src/services/ai/ask-orchestrator");

const evidenceItem = {
  id: "chunk-001",
  articleId: "article-001",
  slug: "tipos-de-cimentacion",
  title: "Tipos de cimentación",
  version: 2,
  section: "Clasificación",
  content: "La publicación describe diferentes tipos de cimentación.",
  excerpt: "La publicación describe diferentes tipos de cimentación."
};

function adapters(overrides = {}) {
  return {
    retriever: {
      async search() {
        return { items: [evidenceItem] };
      }
    },
    coverageEvaluator: {
      async evaluate() {
        return { status: "sufficient", missingInformation: [] };
      }
    },
    safetyGuard: {
      async evaluate() {
        return { decision: "allow" };
      }
    },
    answerGenerator: {
      async generate() {
        return {
          text: "La publicación describe diferentes tipos de cimentación.",
          citationIds: ["chunk-001"]
        };
      }
    },
    ...overrides
  };
}

test("valida y normaliza la pregunta", () => {
  assert.equal(validateQuestion("  ¿Qué es una cimentación?  "), "¿Qué es una cimentación?");
});

test("rechaza preguntas vacías o demasiado cortas", () => {
  assert.throws(() => validateQuestion("  "), AskInputError);
  assert.throws(() => validateQuestion("sí"), AskInputError);
});

test("rechaza preguntas que exceden 2000 caracteres", () => {
  assert.throws(() => validateQuestion("a".repeat(2001)), AskInputError);
});

test("responde con evidencia y referencias verificadas", async () => {
  const orchestrator = createAskOrchestrator(adapters());
  const result = await orchestrator.ask({ question: "¿Qué tipos de cimentación existen?" });

  assert.equal(result.status, "answered");
  assert.equal(result.coverage, "sufficient");
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].citationId, "chunk-001");
  assert.equal(result.citations[0].version, 2);
});

test("mantiene el estado parcial y comunica la información faltante", async () => {
  const orchestrator = createAskOrchestrator(adapters({
    coverageEvaluator: {
      async evaluate() {
        return {
          status: "partial",
          missingInformation: ["No se documentan las condiciones del terreno."]
        };
      }
    }
  }));

  const result = await orchestrator.ask({ question: "¿Qué cimentación debo usar?" });

  assert.equal(result.status, "partial");
  assert.equal(result.coverage, "partial");
  assert.deepEqual(result.missingInformation, ["No se documentan las condiciones del terreno."]);
});

test("no genera una respuesta cuando la cobertura es insuficiente", async () => {
  let generatorCalled = false;
  let gapRecorded = false;

  const orchestrator = createAskOrchestrator(adapters({
    coverageEvaluator: {
      async evaluate() {
        return { status: "insufficient", missingInformation: ["Faltan datos técnicos."] };
      }
    },
    answerGenerator: {
      async generate() {
        generatorCalled = true;
        return { text: "No debe ejecutarse.", citationIds: ["chunk-001"] };
      }
    },
    gapRecorder: {
      async record() {
        gapRecorded = true;
      }
    }
  }));

  const result = await orchestrator.ask({ question: "¿Qué cimentación debo usar?" });

  assert.equal(result.status, "insufficient");
  assert.equal(generatorCalled, false);
  assert.equal(gapRecorded, true);
});

test("no genera respuesta cuando el recuperador no encuentra evidencia", async () => {
  let generatorCalled = false;

  const orchestrator = createAskOrchestrator(adapters({
    retriever: {
      async search() {
        return { items: [] };
      }
    },
    answerGenerator: {
      async generate() {
        generatorCalled = true;
        return { text: "No debe ejecutarse.", citationIds: [] };
      }
    }
  }));

  const result = await orchestrator.ask({ question: "¿Qué es un lindero?" });

  assert.equal(result.status, "insufficient");
  assert.equal(result.citations.length, 0);
  assert.equal(generatorCalled, false);
});

test("solicita aclaraciones cuando el control de seguridad lo indica", async () => {
  const orchestrator = createAskOrchestrator(adapters({
    safetyGuard: {
      async evaluate() {
        return {
          decision: "clarify",
          message: "Indica la ubicación y las condiciones del proyecto.",
          questions: ["¿En qué ubicación se realizará el proyecto?"]
        };
      }
    }
  }));

  const result = await orchestrator.ask({ question: "¿Qué cimentación debo usar?" });

  assert.equal(result.status, "needs_clarification");
  assert.equal(result.clarificationQuestions.length, 1);
});

test("rechaza citas que no pertenecen a la evidencia recuperada", async () => {
  const orchestrator = createAskOrchestrator(adapters({
    answerGenerator: {
      async generate() {
        return { text: "Respuesta sin respaldo.", citationIds: ["chunk-ajeno"] };
      }
    }
  }));

  await assert.rejects(
    () => orchestrator.ask({ question: "¿Qué tipos de cimentación existen?" }),
    (error) => error instanceof AskAdapterError && error.code === "UNVERIFIED_CITATION"
  );
});

test("no permite continuar si falta un adaptador obligatorio", async () => {
  const orchestrator = createAskOrchestrator({});

  await assert.rejects(
    () => orchestrator.ask({ question: "¿Qué es una cimentación?" }),
    (error) => error instanceof AskAdapterError && error.code === "ADAPTER_NOT_CONFIGURED"
  );
});
