"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTavilySearchProvider,
  normalizeTavilyResults,
  normalizeTavilyExtractResults
} = require("../src/services/research/tavily-search-provider");

test("valida consulta y normaliza resultados web deduplicados", async () => {
  const provider = createTavilySearchProvider({ apiKey: "test" });
  await assert.rejects(provider.search({ query: "x" }), { code: "INVALID_RESEARCH_QUERY" });
  const results = normalizeTavilyResults({
    results: [
      { url: "https://example.org/a", title: "A", content: "Contenido", score: 0.9, images: [{ url: "https://cdn.example.org/a-diagram.jpg", description: "Diagrama técnico", source_url: "https://example.org/a" }] },
      { url: "https://example.org/a", title: "Duplicado" },
      { url: "javascript:alert(1)", title: "No válida" }
    ]
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "A");
  assert.equal(results[0].score, 0.9);
  assert.equal(results[0].images.length, 1);
  assert.equal(results[0].images[0].description, "Diagrama técnico");
});

test("realiza búsqueda Tavily básica de un crédito y devuelve fuentes", async () => {
  let request;
  const provider = createTavilySearchProvider({
    apiKey: "test-tavily-key",
    extractEnabled: true,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() {
          return {
            results: [
              { title: "Norma oficial", url: "https://example.org/norma", content: "Fragmento de la norma", score: 0.91, published_date: "2026-01-01", images: [{ url: "https://cdn.example.org/norma-diagram.jpg", description: "Diagrama de la norma" }] }
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
  assert.equal(request.body.include_images, true);
  assert.equal(request.body.include_image_descriptions, true);
  assert.equal(result.provider, "tavily");
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].images.length, 1);
  assert.equal(result.results[0].images[0].alt, "Diagrama de la norma");
  assert.equal(result.usage.credits, 1);
  assert.equal(result.requestId, "request-123");
});

test("clasifica el límite HTTP de Tavily aunque el cuerpo no sea JSON", async () => {
  const provider = createTavilySearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() { throw new SyntaxError("empty or non-JSON body"); }
    })
  });
  await assert.rejects(
    provider.search({ query: "Consulta de prueba" }),
    { code: "RESEARCH_RATE_LIMITED" }
  );
});

test("clasifica credenciales rechazadas aunque el cuerpo no sea JSON", async () => {
  const provider = createTavilySearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      async json() { throw new SyntaxError("non-JSON body"); }
    })
  });
  await assert.rejects(
    provider.search({ query: "Consulta de prueba" }),
    { code: "TAVILY_CREDENTIAL_INVALID" }
  );
});

test("no consume créditos de extracción si no existe autorización explícita", async () => {
  let called = false;
  const provider = createTavilySearchProvider({
    apiKey: "test-key",
    fetchImpl: async () => { called = true; }
  });
  const result = await provider.extract({
    urls: ["https://example.org/a"],
    query: "Consulta de prueba"
  });
  assert.equal(called, false);
  assert.equal(result.enabled, false);
  assert.equal(result.results.length, 0);
});

test("extrae contenido de varias URL y normaliza resultados por URL", async () => {
  let request;
  const provider = createTavilySearchProvider({
    apiKey: "test-tavily-key",
    extractEnabled: true,
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body), headers: options.headers };
      return {
        ok: true, status: 200,
        async json() {
          return {
            results: [
              { url: "https://example.org/a#fragment", raw_content: "Contenido íntegro A" },
              { url: "https://example.org/b", raw_content: "Contenido íntegro B" }
            ],
            failed_results: [{ url: "https://example.org/c", error: "unavailable" }],
            usage: { credits: 1 }, request_id: "extract-123"
          };
        }
      };
    }
  });
  const result = await provider.extract({
    urls: ["https://example.org/a", "https://example.org/b", "https://example.org/a"],
    query: "Consulta de prueba"
  });
  assert.equal(request.url, "https://api.tavily.com/extract");
  assert.equal(request.headers.Authorization, "Bearer test-tavily-key");
  assert.deepEqual(request.body.urls, ["https://example.org/a", "https://example.org/b"]);
  assert.equal(request.body.chunks_per_source, 3);
  assert.equal(request.body.extract_depth, "basic");
  assert.equal(request.body.format, "markdown");
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].rawContent, "Contenido íntegro A");
  assert.equal(result.usage.credits, 1);
  assert.equal(result.requestId, "extract-123");
});

test("clasifica límites HTTP de Tavily Extract sin requerir JSON", async () => {
  const provider = createTavilySearchProvider({
    apiKey: "test-key",
    extractEnabled: true,
    fetchImpl: async () => ({
      ok: false, status: 429,
      async json() { throw new SyntaxError("empty body"); }
    })
  });
  await assert.rejects(
    provider.extract({ urls: ["https://example.org/a"], query: "Consulta de prueba" }),
    { code: "RESEARCH_RATE_LIMITED" }
  );
});

test("normaliza solo contenido extraído con URL HTTP o HTTPS", () => {
  const results = normalizeTavilyExtractResults({
    results: [
      { url: "https://example.org/a", raw_content: "Contenido válido" },
      { url: "file:///etc/passwd", raw_content: "No válido" },
      { url: "https://example.org/b", raw_content: " " }
    ]
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].rawContent, "Contenido válido");
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
