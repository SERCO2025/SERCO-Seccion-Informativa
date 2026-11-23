"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");
const { createGeminiResearchProvider } = require("../src/services/research/gemini-research-provider");

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

test("envía consulta al proveedor y devuelve las respuestas pública y ampliada", async () => {
  let received;
  const handler = createResearchHttpHandler({
    async research(input) {
      received = input;
      return {
        status: "completed",
        query: input.query,
        visitorAnswer: "Respuesta breve",
        expandedAnswer: "Respuesta ampliada",
        sources: [],
        sourceCount: 0,
        persistence: "not_configured"
      };
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
  assert.equal(res.payload.visitorAnswer, "Respuesta breve");
  assert.equal(res.payload.expandedAnswer, "Respuesta ampliada");
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("no expone el contenido extraído interno de las páginas en la respuesta pública", async () => {
  const handler = createResearchHttpHandler({
    async research(input) {
      return {
        status: "completed",
        query: input.query,
        visitorAnswer: "Respuesta breve",
        expandedAnswer: "Respuesta ampliada",
        sources: [{
          id: 1,
          url: "https://example.org/source",
          title: "Fuente",
          publishedDate: "2026-11-01",
          score: 0.9,
          excerpt: "Extracto público",
          extractedContent: "Contenido interno extraído de la página",
          evidenceText: "Texto interno de evidencia",
          evidenceOrigin: "tavily_extract"
        }],
        sourceCount: 1
      };
    }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Consulta válida" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.sources[0].excerpt, "Extracto público");
  assert.equal(Object.hasOwn(res.payload.sources[0], "extractedContent"), false);
  assert.equal(Object.hasOwn(res.payload.sources[0], "evidenceText"), false);
  assert.equal(Object.hasOwn(res.payload.sources[0], "evidenceOrigin"), false);
});

test("reserva HTTP 429 para el límite público y devuelve 503 si Gemini está limitado", async () => {
  const { ResearchProviderError } = require("../src/services/research/gemini-research-provider");
  const handler = createResearchHttpHandler({
    async research() {
      throw new ResearchProviderError("Gemini agotó su cuota", "RESEARCH_RATE_LIMITED");
    }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Investigar especificaciones de concreto" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, "RESEARCH_PROVIDER_RATE_LIMITED");
  assert.equal(res.payload.error.message.includes("cuota"), false);
});

test("responde 503 si falta configurar la clave de Gemini", async () => {
  const provider = createGeminiResearchProvider({ apiKey: "", fetchImpl: async () => { throw new Error("No debe llamar"); } });
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
      const { ResearchProviderError } = require("../src/services/research/gemini-research-provider");
      throw new ResearchProviderError(error.message, error.code);
    }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Investigar especificaciones de concreto" } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.error.message.includes("credencial"), false);
});

test("reserva cuota después de validar la consulta", async () => {
  let reserved = 0;
  let researched = 0;
  const handler = createResearchHttpHandler({
    async research() { researched += 1; return {}; }
  }, {
    async beforeResearch() { reserved += 1; return { allowed: true, reservationId: "reservation-1" }; }
  });
  const invalid = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "x" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(reserved, 0);
  assert.equal(researched, 0);

  const valid = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Consulta válida" } }, valid);
  assert.equal(reserved, 1);
  assert.equal(researched, 1);
});

test("no inicia investigación cuando la reserva alcanza el límite público", async () => {
  let researched = 0;
  const handler = createResearchHttpHandler({
    async research() { researched += 1; return {}; }
  }, {
    async beforeResearch() { return { allowed: false, reservationId: null }; }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Consulta válida" } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.error.code, "PUBLIC_RATE_LIMITED");
  assert.equal(researched, 0);
});

test("devuelve la reserva cuando el proveedor falla", async () => {
  let released = null;
  const { ResearchProviderError } = require("../src/services/research/gemini-research-provider");
  const handler = createResearchHttpHandler({
    async research() { throw new ResearchProviderError("Falla temporal", "RESEARCH_UPSTREAM_ERROR"); }
  }, {
    async beforeResearch() { return { allowed: true, reservationId: "reservation-2" }; },
    async onResearchFailure(reservation) { released = reservation.reservationId; }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Consulta válida" } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(released, "reservation-2");
});

test("finaliza la reserva sin devolver cuota si la investigación se completó", async () => {
  let completed = 0;
  let released = 0;
  const handler = createResearchHttpHandler({
    async research(input) {
      return {
        status: "completed",
        query: input.query,
        visitorAnswer: "Respuesta",
        expandedAnswer: "Ampliación",
        sources: [],
        sourceCount: 0
      };
    }
  }, {
    async beforeResearch() { return { allowed: true, reservationId: "reservation-3" }; },
    async onResearchSuccess(reservation) {
      assert.equal(reservation.reservationId, "reservation-3");
      completed += 1;
    },
    async onResearchFailure() { released += 1; }
  });
  const res = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { query: "Consulta válida" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(completed, 1);
  assert.equal(released, 0);
});
