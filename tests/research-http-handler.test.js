"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");
const { createOpenAIResearchProvider } = require("../src/services/research/openai-research-provider");

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

test("rechaza métodos distintos de POST", async () => {
  const handler = createResearchHttpHandler({ async research() { return {}; } });
  const res = responseRecorder();
  await handler({ method: "GET", headers: {}, body: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("rechaza cuerpo JSON inválido y exceso de tamaño", async () => {
  const handler = createResearchHttpHandler({ async research() { return {}; } });
  const invalid = responseRecorder();
  await handler({ method: "POST", headers: {}, body: "{" }, invalid);
  assert.equal(invalid.statusCode, 400);
  const large = responseRecorder();
  await handler({ method: "POST", headers: { "content-length": "8193" }, body: {} }, large);
  assert.equal(large.statusCode, 413);
});

test("envía consulta al proveedor y devuelve el informe", async () => {
  let received;
  const handler = createResearchHttpHandler({
    async research(input) {
      received = input;
      return { status: "completed", report: "Informe", sources: [] };
    }
  });
  const res = responseRecorder();
  await handler({
    method: "POST",
    headers: {},
    body: { query: "Investigar especificaciones de concreto" }
  }, res);
  assert.deepEqual(received, { query: "Investigar especificaciones de concreto" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.report, "Informe");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("responde 503 si falta configurar la clave de OpenAI", async () => {
  const provider = createOpenAIResearchProvider({ apiKey: "", fetchImpl: async () => { throw new Error("No debe llamar"); } });
  const handler = createResearchHttpHandler(provider);
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Investigar especificaciones de concreto" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, "RESEARCH_NOT_CONFIGURED");
});

test("no expone detalles internos del proveedor", async () => {
  const handler = createResearchHttpHandler({
    async research() {
      const error = new Error("detalle privado de credencial");
      error.code = "RESEARCH_UPSTREAM_ERROR";
      const { ResearchProviderError } = require("../src/services/research/openai-research-provider");
      throw new ResearchProviderError(error.message, error.code);
    }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Investigar especificaciones de concreto" } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.error.message.includes("credencial"), false);
});
