"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createGeminiResearchProvider,
  validateResearchRequest,
  collectOutputText,
  buildContextualSearchQuery,
  selectUsableResearchResults
} = require("../src/services/research/gemini-research-provider");

test("valida longitud y caracteres de la consulta", () => {
  assert.equal(validateResearchRequest({ query: "  ¿Qué es una zapata?  " }), "¿Qué es una zapata?");
  assert.throws(() => validateResearchRequest({ query: "x" }), { code: "INVALID_RESEARCH_QUERY" });
  assert.throws(() => validateResearchRequest({ query: "abc\u0000def" }), { code: "INVALID_RESEARCH_QUERY" });
});

test("contextualiza deslinde en el marco técnico y jurídico mexicano sin alterar la consulta original", () => {
  const query = "¿Qué es un deslinde?";
  const contextual = buildContextualSearchQuery(query);
  assert.ok(contextual.startsWith(query));
  assert.match(contextual, /catastro/);
  assert.match(contextual, /México/);
});

test("trata varillas como una consulta técnica ambigua y distingue sectores", () => {
  const contextual = buildContextualSearchQuery("¿Para qué sirven las varillas?");
  assert.match(contextual, /geotecnia/);
  assert.match(contextual, /acero de refuerzo/);
  assert.match(contextual, /No presupongas una sola acepción/);
  assert.equal(buildContextualSearchQuery("¿Para qué sirven las varillas zahoríes?"), "¿Para qué sirven las varillas zahoríes?");
});

test("excluye fuentes centradas en zahoríes para una consulta genérica sobre varillas", () => {
  const selected = selectUsableResearchResults([
    {
      url: "https://example.org/zahori",
      title: "Varillas zahoríes para encontrar agua",
      content: "La radiestesia utiliza varillas para localizar agua subterránea.",
      score: 0.99
    },
    {
      url: "https://example.org/suelos",
      title: "Estudio geotécnico y exploración de suelos",
      content: "La exploración geotécnica caracteriza el terreno mediante sondeos y ensayos.",
      score: 0.8
    }
  ], "¿Para qué sirven las varillas?");
  assert.equal(selected.length, 1);
  assert.equal(selected[0].url, "https://example.org/suelos");
});

test("no excluye fuentes sobre zahoríes cuando la consulta los solicita expresamente", () => {
  const selected = selectUsableResearchResults([
    {
      url: "https://example.org/zahori",
      title: "Varillas zahoríes para encontrar agua",
      content: "La radiestesia utiliza varillas para localizar agua subterránea.",
      score: 0.99
    }
  ], "¿Qué son las varillas zahoríes?");
  assert.equal(selected.length, 1);
});

test("ordena fuentes por score, descarta fragmentos vacíos y deduplica URL", () => {
  const selected = selectUsableResearchResults([
    { url: "https://example.org/a", title: "Sin fragmento", content: "", score: 1 },
    { url: "https://example.org/b", title: "Fuente media", content: "Contenido disponible", score: 0.5 },
    { url: "https://example.org/b#seccion", title: "Duplicada", content: "Otro contenido", score: 0.9 },
    { url: "https://example.org/c", title: "Fuente alta", content: "Contenido relevante", score: 0.95 },
    { url: "https://example.org/d", title: "", content: "Sin título", score: 0.8 }
  ]);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].title, "Fuente alta");
  assert.equal(selected[1].title, "Duplicada");
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
          return { candidates: [{ content: { parts: [{ text: JSON.stringify({ internalReport: "Expediente con referencia [1].", visitorAnswer: "Respuesta breve con referencia [1].", expandedAnswer: "Explicación ampliada con referencia [1]." }) }] } }] };
        }
      };
    }
  });

  const result = await provider.research({ query: "Normativa de pavimentos en México" });
  assert.equal(geminiRequest.url, "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent");
  assert.equal(geminiRequest.options.headers["x-goog-api-key"], "test-gemini-key");
  assert.equal(geminiRequest.body.tools, undefined);
  assert.match(geminiRequest.body.system_instruction.parts[0].text, /referencias \[1\]/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /Fragmento recuperado de la fuente/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /Puntuación de relevancia de Tavily/);
  assert.equal(result.provider, "tavily+gemini");
  assert.equal(result.searchProvider, "tavily");
  assert.equal(result.answerProvider, "gemini");
  assert.equal(result.internalReport, "Expediente con referencia [1].");
  assert.equal(result.visitorAnswer, "Respuesta breve con referencia [1].");
  assert.equal(result.expandedAnswer, "Explicación ampliada con referencia [1].");
  assert.equal(result.sources[0].id, 1);
  assert.equal(result.sources[0].url, "https://example.org/norma");
  assert.equal(result.searchUsage.credits, 1);
  assert.equal(result.searchSuggestionsHtml, null);
});

test("usa consulta enriquecida para Tavily y conserva la consulta original en el resultado", async () => {
  let tavilyQuery = "";
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: {
      async search(input) {
        tavilyQuery = input.query;
        return { provider: "tavily", results: [{
          url: "https://example.org/deslinde",
          title: "Guía de deslinde",
          content: "Información técnica sobre topografía, catastro y límites de predios."
        }] };
      }
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: JSON.stringify({
          internalReport: "Informe",
          visitorAnswer: "Respuesta",
          expandedAnswer: "Ampliación"
        }) }] } }] };
      }
    })
  });
  const result = await provider.research({ query: "¿Qué es un deslinde?" });
  assert.match(tavilyQuery, /topografía/);
  assert.equal(result.query, "¿Qué es un deslinde?");
  assert.equal(result.searchQueries[0], tavilyQuery);
});

test("no envía a Gemini resultados sin título o contenido", async () => {
  let geminiCalled = false;
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: {
      async search() {
        return { provider: "tavily", results: [{ url: "https://example.org", title: "Fuente", content: "  " }] };
      }
    },
    fetchImpl: async () => { geminiCalled = true; throw new Error("No debe llamar"); }
  });
  await assert.rejects(
    provider.research({ query: "Investigación sin fragmento" }),
    { code: "NO_USABLE_SOURCE_CONTENT" }
  );
  assert.equal(geminiCalled, false);
});

test("reintenta una respuesta HTTP 503 de Gemini sin repetir Tavily", async () => {
  let searchCalls = 0;
  let geminiCalls = 0;
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: {
      async search() {
        searchCalls += 1;
        return {
          provider: "tavily",
          results: [{ url: "https://example.org", title: "Fuente", content: "Texto" }],
          usage: { credits: 1 }
        };
      }
    },
    sleepImpl: async () => {},
    fetchImpl: async () => {
      geminiCalls += 1;
      if (geminiCalls === 1) return { ok: false, status: 503, statusText: "Unavailable", async json() { return { error: { message: "Temporalmente no disponible" } }; } };
      return {
        ok: true,
        async json() {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify({
            internalReport: "Informe",
            visitorAnswer: "Respuesta",
            expandedAnswer: "Ampliación"
          }) }] } }] };
        }
      };
    }
  });

  const result = await provider.research({ query: "Investigación de prueba" });
  assert.equal(result.visitorAnswer, "Respuesta");
  assert.equal(searchCalls, 1);
  assert.equal(geminiCalls, 2);
});

test("limita Retry-After cuando la automatización necesita respetar un plazo corto", async () => {
  const delays = [];
  let geminiCalls = 0;
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: {
      async search() {
        return { provider: "tavily", results: [{ url: "https://example.org", title: "Fuente", content: "Texto" }] };
      }
    },
    maxRetryDelayMs: 2000,
    sleepImpl: async (milliseconds) => { delays.push(milliseconds); },
    fetchImpl: async () => {
      geminiCalls += 1;
      if (geminiCalls === 1) {
        return {
          ok: false,
          status: 503,
          headers: { get: () => "10" },
          async json() { return { error: { message: "Temporalmente no disponible" } }; }
        };
      }
      return {
        ok: true,
        async json() {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify({
            internalReport: "Informe",
            visitorAnswer: "Respuesta",
            expandedAnswer: "Ampliación"
          }) }] } }] };
        }
      };
    }
  });
  await provider.research({ query: "Investigación con plazo controlado" });
  assert.equal(geminiCalls, 2);
  assert.deepEqual(delays, [2000]);
});

test("reintenta un timeout de Gemini sin repetir la búsqueda Tavily", async () => {
  let searchCalls = 0;
  let geminiCalls = 0;
  const delays = [];
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: {
      async search() {
        searchCalls += 1;
        return {
          provider: "tavily",
          results: [{ url: "https://example.org", title: "Fuente", content: "Texto" }],
          usage: { credits: 1 }
        };
      }
    },
    sleepImpl: async (milliseconds) => { delays.push(milliseconds); },
    fetchImpl: async () => {
      geminiCalls += 1;
      if (geminiCalls === 1) {
        const error = new Error("Tiempo agotado");
        error.name = "TimeoutError";
        throw error;
      }
      return {
        ok: true,
        async json() {
          return { candidates: [{ content: { parts: [{ text: JSON.stringify({
            internalReport: "Informe",
            visitorAnswer: "Respuesta",
            expandedAnswer: "Ampliación"
          }) }] } }] };
        }
      };
    }
  });

  const result = await provider.research({ query: "Investigación con timeout" });
  assert.equal(result.visitorAnswer, "Respuesta");
  assert.equal(searchCalls, 1);
  assert.equal(geminiCalls, 2);
  assert.deepEqual(delays, [1000]);
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


test("rechaza referencias que no corresponden a ninguna fuente recuperada", async () => {
  const provider = createGeminiResearchProvider({
    apiKey: "test-gemini-key",
    searchProvider: {
      async search() {
        return {
          provider: "tavily",
          results: [{ url: "https://example.org", title: "Fuente", content: "Fragmento", score: 0.8 }]
        };
      }
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { candidates: [{ content: { parts: [{ text: JSON.stringify({
          internalReport: "Informe con referencia [2].",
          visitorAnswer: "Respuesta breve.",
          expandedAnswer: "Ampliación."
        }) }] } }] };
      }
    })
  });
  await assert.rejects(
    provider.research({ query: "Investigación de prueba" }),
    { code: "INVALID_RESEARCH_CITATION" }
  );
});
