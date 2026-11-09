"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createGeminiResearchProvider,
  validateResearchRequest,
  collectSources,
  collectGroundingSupports
} = require("../src/services/research/gemini-research-provider");

test("valida longitud y caracteres de la consulta", () => {
  assert.equal(validateResearchRequest({ query: "  ¿Qué es una zapata?  " }), "¿Qué es una zapata?");
  assert.throws(() => validateResearchRequest({ query: "x" }), { code: "INVALID_RESEARCH_QUERY" });
  assert.throws(() => validateResearchRequest({ query: "abc\u0000def" }), { code: "INVALID_RESEARCH_QUERY" });
});

test("extrae y deduplica fuentes web de groundingMetadata", () => {
  const sources = collectSources({
    candidates: [{
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://example.org/a", title: "Fuente A" } },
          { web: { uri: "https://example.org/a", title: "Duplicada" } },
          { web: { uri: "https://example.org/b", title: "Fuente B" } },
          { web: { uri: "javascript:alert(1)", title: "No válida" } }
        ]
      }
    }]
  });
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, "Fuente A");
  assert.equal(sources[1].url, "https://example.org/b");
});

test("extrae asociaciones entre segmentos de respuesta y fuentes", () => {
  const supports = collectGroundingSupports({
    candidates: [{
      groundingMetadata: {
        groundingSupports: [{
          segment: { text: "Afirmación respaldada", startIndex: 0, endIndex: 22 },
          groundingChunkIndices: [0, 2]
        }]
      }
    }]
  });
  assert.deepEqual(supports, [{
    text: "Afirmación respaldada",
    startIndex: 0,
    endIndex: 22,
    sourceIndices: [0, 2]
  }]);
});

test("envía Google Search a Gemini y devuelve informe, fuentes y sugerencias", async () => {
  let request;
  const provider = createGeminiResearchProvider({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            candidates: [{
              content: { parts: [{ text: "Informe de prueba con fuentes." }] },
              groundingMetadata: {
                webSearchQueries: ["normativa de pavimentos México"],
                searchEntryPoint: { renderedContent: "<div>Search suggestions</div>" },
                groundingChunks: [
                  { web: { uri: "https://example.org/source", title: "Fuente de prueba" } }
                ],
                groundingSupports: [{
                  segment: { text: "Informe de prueba", startIndex: 0, endIndex: 18 },
                  groundingChunkIndices: [0]
                }]
              }
            }]
          };
        }
      };
    }
  });

  const result = await provider.research({ query: "Normativa de pavimentos en México" });
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
  assert.equal(request.options.headers["x-goog-api-key"], "test-key");
  assert.deepEqual(request.body.tools, [{ google_search: {} }]);
  assert.match(request.body.system_instruction.parts[0].text, /no respondas solo desde tu memoria/i);
  assert.equal(result.provider, "gemini");
  assert.equal(result.report, "Informe de prueba con fuentes.");
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.searchQueries, ["normativa de pavimentos México"]);
  assert.equal(result.searchSuggestionsHtml, "<div>Search suggestions</div>");
  assert.equal(result.groundingSupports.length, 1);
  assert.equal(result.persistence, "not_configured");
});

test("no realiza llamadas si falta la clave Gemini", async () => {
  let called = false;
  const provider = createGeminiResearchProvider({
    apiKey: "",
    fetchImpl: async () => { called = true; }
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "RESEARCH_NOT_CONFIGURED" }
  );
  assert.equal(called, false);
});

test("rechaza un informe sin fuentes web fundamentadas", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: "Respuesta sin fuentes" }] } }] };
      }
    })
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "NO_GROUNDED_SOURCES" }
  );
});

test("convierte error 429 de Gemini en límite controlado", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { return { error: { status: "RESOURCE_EXHAUSTED" } }; }
    })
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "RESEARCH_RATE_LIMITED" }
  );
});

test("convierte credenciales rechazadas en error de configuración", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      async json() { return { error: { message: "private provider detail" } }; }
    })
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "RESEARCH_CREDENTIAL_INVALID" }
  );
});
