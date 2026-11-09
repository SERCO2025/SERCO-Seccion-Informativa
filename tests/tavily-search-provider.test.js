"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTavilySearchProvider,
  normalizeTavilyResults
} = require("../src/services/research/tavily-search-provider");

test("valida consulta y normaliza resultados web deduplicados", async () => {
  const provider = createTavilySearchProvider({ apiKey: "test" });
  await assert.rejects(provider.search({ query: "x" }), { code: "INVALID_RESEARCH_QUERY" });
  const results = normalizeTavilyResults({
    results: [
      { url: "https://example.org/a", title: "A", content: "Contenido", score: 0.9 },
      { url: "https://example.org/a", title: "Duplicado" },
      { url: "javascript:alert(1)", title: "No válida" }
    ]
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "A");
  assert.equal(results[0].score, 0.9);
});

test("realiza búsqueda Tavily básica de un crédito y devuelve fuentes", async () => {
  let request;
  const provider = createTavilySearchProvider({
    apiKey: "test-tavily-key",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            results: [
              { title: "Norma oficial", url: "https://example.org/norma", content: "Fragmento de la norma", score: 0.91, published_date: "2026-01-01" }
            ],
            usage: { credits: 1 },
            request_id: "request-123"
          };
        }
      };
    }
  });
  const result = await provider.search({ query: "Normativa de concreto en México" });
  assert.equal(request.url, "https://api.tavily.com/search");
  assert.equal(request.options.headers.Authorization, "Bearer test-tavily-key");
  assert.equal(request.body.search_depth, "basic");
  assert.equal(request.body.max_results, 8);
  assert.equal(request.body.include_answer, false);
  assert.equal(request.body.include_raw_content, false);
  assert.equal(result.provider, "tavily");
  assert.equal(result.results.length, 1);
  assert.equal(result.usage.credits, 1);
  assert.equal(result.requestId, "request-123");
});

test("no realiza llamadas si falta la clave Tavily", async () => {
  let called = false;
  const provider = createTavilySearchProvider({
    apiKey: "",
    fetchImpl: async () => { called = true; }
  });
  await assert.rejects(provider.search({ query: "Consulta de prueba" }), { code: "RESEARCH_NOT_CONFIGURED" });
  assert.equal(called, false);
});

test("convierte límites de cuota Tavily en error controlado", async () => {
  const provider = createTavilySearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 432,
      async json() { return { detail: { error: "quota exceeded" } }; }
    })
  });
  await assert.rejects(provider.search({ query: "Consulta de prueba" }), { code: "RESEARCH_RATE_LIMITED" });
});

test("no acepta resultados sin URL HTTP o HTTPS", async () => {
  const provider = createTavilySearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      async json() { return { results: [{ url: "file:///etc/passwd", title: "No válida" }] }; }
    })
  });
  await assert.rejects(provider.search({ query: "Consulta de prueba" }), { code: "NO_SEARCH_RESULTS" });
});
