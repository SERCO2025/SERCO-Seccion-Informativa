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

test("rechaza un cuerpo de texto grande aunque no declare Content-Length", async () => {
  const handler = createAskHttpHandler({ async ask() { throw new Error("No debe ejecutarse."); } });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: JSON.stringify({ question: "x".repeat(9000) })
  }, res);

  assert.equal(res.statusCode, 413);
  assert.equal(res.payload.error.code, "BODY_TOO_LARGE");
});

test("rechaza un cuerpo ya parseado que excede el límite", async () => {
  const handler = createAskHttpHandler({ async ask() { throw new Error("No debe ejecutarse."); } });
  const res = responseRecorder();

  await handler({
    method: "POST",
    headers: {},
    body: { question: "x".repeat(9000) }
  }, res);

  assert.equal(res.statusCode, 413);
  assert.equal(res.payload.error.code, "BODY_TOO_LARGE");
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

test("responde 503 sin filtrar detalles cuando Supabase no está configurado", async () => {
  const handler = createAskHttpHandler({
    async ask() {
      const error = new Error("secret database configuration");
      error.code = "SUPABASE_RETRIEVER_NOT_CONFIGURED";
      throw error;
    }
  });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: { question: "¿Qué es un lindero?" } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, "SERVICE_TEMPORARILY_UNAVAILABLE");
  assert.equal(JSON.stringify(res.payload).includes("secret database configuration"), false);
});

test("responde 503 cuando los proveedores IA se agotan", async () => {
  const handler = createAskHttpHandler({
    async ask() {
      const error = new Error("provider internals");
      error.code = "AI_PROVIDERS_EXHAUSTED";
      throw error;
    }
  });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: { question: "¿Qué es un lindero?" } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, "SERVICE_TEMPORARILY_UNAVAILABLE");
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


test("valida la pregunta antes de consultar y consumir la cuota", async () => {
  let quotaChecks = 0;
  let askCalls = 0;
  const handler = createAskHttpHandler({
    async ask() { askCalls += 1; return {}; }
  }, {
    async beforeAsk() { quotaChecks += 1; return true; }
  });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: { question: "  " } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error.code, "INVALID_QUESTION");
  assert.equal(quotaChecks, 0);
  assert.equal(askCalls, 0);
});

test("rechaza por cuota después de validar la pregunta y antes de ejecutar el orquestador", async () => {
  let receivedQuestion = null;
  let askCalls = 0;
  const handler = createAskHttpHandler({
    async ask() { askCalls += 1; return {}; }
  }, {
    async beforeAsk(req, question) { receivedQuestion = question; return false; }
  });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: { question: "  ¿Qué es un lindero?  " } }, res);

  assert.equal(receivedQuestion, "¿Qué es un lindero?");
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.error.code, "PUBLIC_RATE_LIMITED");
  assert.equal(askCalls, 0);
});

test("no consume cuota cuando el JSON es inválido", async () => {
  let quotaChecks = 0;
  const handler = createAskHttpHandler({
    async ask() { throw new Error("No debe ejecutarse."); }
  }, {
    async beforeAsk() { quotaChecks += 1; return true; }
  });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: "{" }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(quotaChecks, 0);
});

test("responde 503 si no puede comprobar la cuota y no ejecuta el orquestador", async () => {
  let askCalls = 0;
  const handler = createAskHttpHandler({
    async ask() { askCalls += 1; return {}; }
  }, {
    async beforeAsk() {
      throw Object.assign(new Error("detalle interno"), { code: "PUBLIC_RATE_LIMIT_NOT_CONFIGURED" });
    }
  });
  const res = responseRecorder();

  await handler({ method: "POST", headers: {}, body: { question: "¿Qué es un lindero?" } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, "PUBLIC_RATE_LIMIT_NOT_CONFIGURED");
  assert.equal(JSON.stringify(res.payload).includes("detalle interno"), false);
  assert.equal(askCalls, 0);
});
