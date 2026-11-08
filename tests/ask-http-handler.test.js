"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test("rechaza métodos distintos de POST", async () => {
  const handler = createAskHttpHandler({ async ask() { return {}; } });
  const res = responseRecorder();

  await handler({ method: "GET", headers: {}, body: {} }, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("rechaza JSON inválido", async () => {
  const handler = createAskHttpHandler({ async ask() { return {}; } });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: "{" }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error.code, "INVALID_JSON");
});

test("rechaza cuerpos mayores al límite", async () => {
  const handler = createAskHttpHandler({ async ask() { return {}; } });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: { "content-length": "8193" },
    body: {}
  }, res);

  assert.equal(res.statusCode, 413);
});

test("envía la pregunta al orquestador y devuelve el resultado", async () => {
  let received = null;
  const handler = createAskHttpHandler({
    async ask(input) {
      received = input;
      return { status: "insufficient", coverage: "insufficient", citations: [] };
    }
  });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "¿Qué es un lindero?", locale: "es-MX" }
  }, res);

  assert.deepEqual(received, { question: "¿Qué es un lindero?", locale: "es-MX" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, "insufficient");
});

test("responde 503 cuando el motor todavía no tiene adaptadores", async () => {
  const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
  const handler = createAskHttpHandler(createAskOrchestrator({}));
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "¿Qué es un lindero?" }
  }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, "SERVICE_NOT_READY");
});
