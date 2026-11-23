"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectPendingTopic } = require("../api/editor-auto-publish");

test("selectPendingTopic rota entre temas cuando un intento anterior no generó artículo", () => {
  const topics = [["Tema A"], ["Tema B"], ["Tema C"], ["Tema D"]];
  const start = new Date("2026-11-23T00:00:00.000Z");
  const first = selectPendingTopic(topics, new Set(), start);
  const next = selectPendingTopic(topics, new Set(), new Date(start.getTime() + 20 * 60 * 1000));
  assert.notEqual(first, next);
});

test("selectPendingTopic omite artículos ya existentes y conserva el orden circular", () => {
  const topics = [["Tema A"], ["Tema B"], ["Tema C"]];
  const titles = new Set(["diccionario técnico: tema b"]);
  const selected = selectPendingTopic(topics, titles, new Date(0));
  assert.equal(selected, topics[0]);
});

test("selectPendingTopic devuelve null cuando todos los temas ya existen", () => {
  const topics = [["Tema A"], ["Tema B"]];
  const titles = new Set(topics.map(([topic]) => ("Diccionario técnico: " + topic).toLowerCase()));
  assert.equal(selectPendingTopic(topics, titles, new Date()), null);
});

test("selectPendingTopic acepta fechas inválidas sin bloquear la cola", () => {
  const topics = [["Tema A"], ["Tema B"]];
  const selected = selectPendingTopic(topics, new Set(), "fecha inválida");
  assert.ok(topics.includes(selected));
});
