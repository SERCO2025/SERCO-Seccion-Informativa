"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createGeminiResearchProvider,
  validateResearchRequest,
  collectOutputText
} = require("../src/services/research/gemini-research-provider");

test("valida longitud y caracteres de la consulta", () => {
  assert.equal(validateResearchRequest({ query: "  ¿Qué es una zapata?  " }), "¿Qué es una zapata?");
  assert.throws(() => validateResearchRequest({ query: "x" }), { code: "INVALID_RESEARCH_QUERY" });
  assert.throws(() => validateResearchRequest({ query: "abc\u0000def" }), { code: "INVALID_RESEARCH_QUERY" });
});

test("extrae texto de la respuesta Gemini", () => {
  assert.equal(collectOutputText({
    candidates: [{ content: { parts: [{ text: "Informe " }, { text: "documental." }] } }]
  }), "Informe \ndocumental.");
});

test("busca primero con Tavily y entrega evidencia a Gemini para redactar", async () => {
  let geminiRequest;
  const searchProvider = {
    async search(input) {
      assert.deepEqual(input, { query: "Normativa de pavimentos en México" });
      return {
        provider: "tavily",
        query: input.query,
        results: [{
          url: "https://example.org/norma",
          title: "Documento técnico",
          content: "Fragmento recuperado de la fuente.",
          score: 0.95,
          publishedDate: "2026-01-01"
        }],
        resultCount: 1,
        usage: { credits: 1 },
        requestId: "tavily-123"
      };
    }
  };
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    model: "test-model",
    searchProvider,
    fetchImpl: async (url, options) => {
      geminiRequest = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return { candidates: [{ content: { parts: [{ text: "Informe con referencia [1]." }] } }] };
        }
      };
    }
  });

  const result = await provider.research({ query: "Normativa de pavimentos en México" });
  assert.equal(geminiRequest.url, "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
  assert.equal(geminiRequest.options.headers["x-goog-api-key"], "test-gemini-key");
  assert.equal(geminiRequest.body.tools, undefined);
  assert.match(geminiRequest.body.system_instruction.parts[0].text, /referencias numeradas/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /Fragmento recuperado de la fuente/);
  assert.equal(result.provider, "tavily+gemini");
  assert.equal(result.searchProvider, "tavily");
  assert.equal(result.answerProvider, "gemini");
  assert.equal(result.report, "Informe con referencia [1].");
  assert.equal(result.sources[0].id, 1);
  assert.equal(result.sources[0].url, "https://example.org/norma");
  assert.equal(result.searchUsage.credits, 1);
  assert.equal(result.searchSuggestionsHtml, null);
});

test("no realiza llamadas si falta la clave Gemini", async () => {
  let searchCalled = false;
  const provider = createGeminiResearchProvider({
    apiKey: "",
    searchProvider: { async search() { searchCalled = true; return { results: [] }; } },
    fetchImpl: async () => { throw new Error("No debe llamar"); }
  });
  await assert.rejects(provider.research({ query: "Investigación de prueba" }), { code: "RESEARCH_NOT_CONFIGURED" });
  assert.equal(searchCalled, false);
});

test("no realiza llamadas si Tavily no está configurado", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: null,
    fetchImpl: async () => { throw new Error("No debe llamar"); }
  });
  await assert.rejects(provider.research({ query: "Investigación de prueba" }), { code: "RESEARCH_NOT_CONFIGURED" });
});

test("rechaza una búsqueda sin resultados", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: { async search() { throw Object.assign(new Error("Sin resultados"), { code: "NO_SEARCH_RESULTS" }); } },
    fetchImpl: async () => { throw new Error("No debe llamar"); }
  });
  await assert.rejects(provider.research({ query: "Investigación de prueba" }), { code: "NO_SEARCH_RESULTS" });
});

test("convierte error 429 de Gemini en límite controlado", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: { async search() { return { results: [{ url: "https://example.org", title: "Fuente", content: "Texto" }], usage: { credits: 1 } }; } },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { return { error: { status: "RESOURCE_EXHAUSTED" } }; }
    })
  });
  await assert.rejects(provider.research({ query: "Investigación de prueba" }), { code: "RESEARCH_RATE_LIMITED" });
});
