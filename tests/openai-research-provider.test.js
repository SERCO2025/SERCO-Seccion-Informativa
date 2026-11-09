"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createOpenAIResearchProvider,
  validateResearchRequest,
  collectSources
} = require("../src/services/research/openai-research-provider");

test("valida longitud y caracteres de la consulta", () => {
  assert.equal(validateResearchRequest({ query: "  ¿Qué es una zapata?  " }), "¿Qué es una zapata?");
  assert.throws(() => validateResearchRequest({ query: "x" }), { code: "INVALID_RESEARCH_QUERY" });
  assert.throws(() => validateResearchRequest({ query: "abc\u0000def" }), { code: "INVALID_RESEARCH_QUERY" });
});

test("extrae fuentes de resultados de búsqueda y anotaciones", () => {
  const sources = collectSources({
    output: [
      { type: "web_search_call", action: { sources: [{ url: "https://example.org/a", title: "Fuente A" }] } },
      { type: "message", content: [{ type: "output_text", text: "Texto", annotations: [
        { type: "url_citation", url: "https://example.org/a", title: "Duplicada" },
        { type: "url_citation", url: "https://example.org/b", title: "Fuente B" }
      ] }] }
    ]
  });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, "Fuente A");
  assert.equal(sources[1].url, "https://example.org/b");
});

test("envía búsqueda web obligatoria a Responses API y devuelve informe y fuentes", async () => {
  let request;
  const provider = createOpenAIResearchProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            status: "completed",
            output_text: "Informe de prueba con fuentes.",
            output: [{ type: "web_search_call", action: { sources: [
              { url: "https://example.org/source", title: "Fuente de prueba" }
            ] } }]
          };
        }
      };
    }
  });

  const result = await provider.research({ query: "Normativa de pavimentos en México" });
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.body.tool_choice, "required");
  assert.equal(request.body.tools[0].type, "web_search");
  assert.equal(result.provider, "openai");
  assert.equal(result.report, "Informe de prueba con fuentes.");
  assert.equal(result.sources.length, 1);
  assert.equal(result.persistence, "not_configured");
});

test("no realiza llamadas si falta la clave", async () => {
  let called = false;
  const provider = createOpenAIResearchProvider({
    apiKey: "",
    fetchImpl: async () => { called = true; }
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "RESEARCH_NOT_CONFIGURED" }
  );
  assert.equal(called, false);
});

test("convierte error 429 del proveedor en límite controlado", async () => {
  const provider = createOpenAIResearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { return { error: { code: "rate_limit" } }; }
    })
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "RESEARCH_RATE_LIMITED" }
  );
});
