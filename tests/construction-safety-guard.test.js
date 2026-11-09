"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createConstructionSafetyGuard } = require("../src/services/ai/construction-safety-guard");

const guard = createConstructionSafetyGuard();

test("permite preguntas informativas generales", async () => {
  const result = await guard.evaluate({ question: "¿Qué es una zapata aislada?" });
  assert.equal(result.decision, "allow");
});

test("solicita contexto para decisiones de cimentación de un proyecto", async () => {
  const result = await guard.evaluate({ question: "¿Qué cimentación debo usar para mi construcción?" });
  assert.equal(result.decision, "clarify");
  assert.ok(result.questions.length >= 3);
});

test("solicita contexto para dimensionamiento estructural", async () => {
  const result = await guard.evaluate({ question: "¿Cómo calculo una viga para soportar la carga?" });
  assert.equal(result.decision, "clarify");
});

test("detecta recomendaciones formuladas en segunda persona", async () => {
  const result = await guard.evaluate({ question: "¿Qué tipo de zapata me recomiendas para mi obra?" });
  assert.equal(result.decision, "clarify");
});

test("detecta solicitudes de dimensionamiento en infinitivo", async () => {
  const result = await guard.evaluate({ question: "¿Cómo dimensionar una columna de concreto?" });
  assert.equal(result.decision, "clarify");
});

test("no bloquea una definición aunque mencione un elemento estructural", async () => {
  const result = await guard.evaluate({ question: "¿Cómo se define una columna de concreto?" });
  assert.equal(result.decision, "allow");
});
