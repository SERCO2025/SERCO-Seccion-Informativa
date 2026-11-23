"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_MODEL,
  OPENROUTER_CHAT_URL,
  createOpenRouterPublisher
} = require("../src/services/publisher/openrouter-publisher-provider");

const rawOutput = JSON.stringify({
  internalReport: "Informe documental con referencia [1].",
  visitorAnswer: "Respuesta sustentada en la fuente [1].",
  expandedAnswer: "Explicación técnica ampliada con referencia [1].",
  claimEvidence: [
    { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
    { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente [1].", assessment: "supported", sourceIds: [1] },
    { section: "expandedAnswer", claim: "Explicación técnica ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
  ]
});

function makeSearchProvider(calls) {
  return {
    async search({ query }) {
      calls.push(query);
      return {
        provider: "tavily",
        results: [
          { url: "https://example.org/engineering", title: "Engineering reference", content: "Technical source excerpt with methods, specifications, measurements and references.", score: 0.9 },
          { url: "https://example.net/materials", title: "Materials technical data", content: "Technical data, documented test methods, application limits and engineering references.", score: 0.8 }
        ]
      };
    }
  };
}

test("usa exclusivamente el modelo independiente configurado para el publicador", () => {
  assert.equal(DEFAULT_MODEL, "inclusionai/ling-3.2-flash:free");
  assert.equal(OPENROUTER_CHAT_URL, "https://openrouter.ai/api/v1/chat/completions");
});

test("busca evidencia una vez y sintetiza con OpenRouter usando el contrato editorial", async () => {
  const searches = [];
  let request;
  const provider = createOpenRouterPublisher({
    apiKey: "publisher-test-key",
    searchProvider: makeSearchProvider(searches),
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            model: "inclusionai/ling-3.2-flash:free",
            choices: [{ message: { content: rawOutput }, finish_reason: "stop" }],
            usage: { total_tokens: 100 }
          };
        }
      };
    }
  });

  const result = await provider.research({ query: "Entrada técnica: concreto estructural" });
  assert.equal(searches.length, 1);
  assert.equal(searches[0], "Entrada técnica: concreto estructural");
  assert.equal(request.url, OPENROUTER_CHAT_URL);
  assert.equal(request.options.headers.Authorization, "Bearer publisher-test-key");
  assert.equal(request.body.model, DEFAULT_MODEL);
  assert.deepEqual(request.body.response_format, { type: "json_object" });
  assert.deepEqual(request.body.reasoning, { enabled: false });
  assert.match(request.body.messages[0].content, /PUBLICADOR EDITORIAL DE SERCO/);
  assert.equal(result.status, "completed");
  assert.equal(result.provider, "openrouter");
  assert.equal(result.model, DEFAULT_MODEL);
  assert.equal(result.sources.length, 2);
  assert.equal(result.claimEvidence.length, 3);
});

test("rechaza modelos de pago antes de realizar búsquedas", async () => {
  let searches = 0;
  const provider = createOpenRouterPublisher({
    apiKey: "publisher-test-key",
    model: "inclusionai/ling-3.2-flash",
    searchProvider: { async search() { searches += 1; return { results: [] }; } },
    fetchImpl: async () => { throw new Error("No debe llamar al proveedor"); }
  });
  await assert.rejects(provider.research({ query: "Concreto" }), {
    code: "PUBLISHER_MODEL_NOT_FREE"
  });
  assert.equal(searches, 0);
});

test("no intenta investigar si falta la credencial independiente", async () => {
  let searches = 0;
  const provider = createOpenRouterPublisher({
    apiKey: "",
    searchProvider: { async search() { searches += 1; return { results: [] }; } },
    fetchImpl: async () => { throw new Error("No debe llamar al proveedor"); }
  });
  await assert.rejects(provider.research({ query: "Concreto" }), {
    code: "PUBLISHER_PROVIDER_NOT_CONFIGURED"
  });
  assert.equal(searches, 0);
});

test("clasifica el límite gratuito como indisponibilidad sin activar otros proveedores", async () => {
  const provider = createOpenRouterPublisher({
    apiKey: "publisher-test-key",
    searchProvider: makeSearchProvider([]),
    fetchImpl: async () => ({ ok: false, status: 429 })
  });
  await assert.rejects(provider.research({ query: "Pavimentos" }), {
    code: "AI_PROVIDERS_UNAVAILABLE"
  });
});
