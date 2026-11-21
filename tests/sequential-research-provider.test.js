"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PROVIDER_ORDER,
  DEFAULT_MODELS,
  parseResearchOutput,
  createProviderAdapters,
  createSequentialResearchProvider
} = require("../src/services/research/sequential-research-provider");

const rawResult = JSON.stringify({
  internalReport: "Informe documental con referencia [1].",
  visitorAnswer: "Respuesta sustentada en la fuente [1].",
  expandedAnswer: "Explicación ampliada con referencia [1].",
  claimEvidence: []
});

function adapter(provider, generate, configured = true) {
  return { provider, model: provider + "-test", configured, generate };
}

function searchProvider(calls) {
  return {
    async search({ query }) {
      calls.count += 1;
      calls.query = query;
      return {
        provider: "tavily",
        results: [{
          url: "https://example.org/source",
          title: "Fuente técnica",
          content: "Contenido recuperado por Tavily.",
          score: 0.95,
          publishedDate: "2026-11-01"
        }],
        usage: { credits: 1 },
        requestId: "tavily-test"
      };
    }
  };
}

test("conserva el orden y los modelos aprobados de los tres proveedores", () => {
  assert.deepEqual(PROVIDER_ORDER, ["gemini", "groq", "cloudflare-workers-ai"]);
  assert.equal(DEFAULT_MODELS.gemini, "gemini-3.8-flash");
  assert.equal(DEFAULT_MODELS.groq, "openai/gpt-oss-120b");
  assert.equal(DEFAULT_MODELS["cloudflare-workers-ai"], "@cf/zai-org/glm-4.7-flash");
});

test("pasa de Gemini a Groq y reutiliza la única búsqueda Tavily", async () => {
  const searchCalls = { count: 0 };
  const calls = [];
  const provider = createSequentialResearchProvider({
    searchProvider: searchProvider(searchCalls),
    providers: [
      adapter("gemini", async () => {
        calls.push("gemini");
        throw Object.assign(new Error("quota"), { code: "PROVIDER_RATE_LIMITED" });
      }),
      adapter("groq", async (prompt) => {
        calls.push("groq");
        assert.match(prompt.user, /Contenido recuperado por Tavily/);
        return { raw: rawResult, usage: { total_tokens: 20 } };
      }),
      adapter("cloudflare-workers-ai", async () => {
        calls.push("cloudflare");
        return { raw: rawResult };
      })
    ]
  });

  const result = await provider.research({ query: "Investigación técnica" });
  assert.deepEqual(calls, ["gemini", "groq"]);
  assert.equal(searchCalls.count, 1);
  assert.equal(result.answerProvider, "groq");
  assert.equal(result.fallbackCount, 1);
  assert.equal(result.sources[0].excerpt, "Contenido recuperado por Tavily.");
  assert.equal(result.searchRequestId, "tavily-test");
});

test("pasa a Cloudflare cuando Gemini y Groq no pueden responder", async () => {
  const searchCalls = { count: 0 };
  const calls = [];
  const unavailable = (name) => async () => {
    calls.push(name);
    throw Object.assign(new Error("unavailable"), { code: "PROVIDER_UNAVAILABLE" });
  };
  const provider = createSequentialResearchProvider({
    searchProvider: searchProvider(searchCalls),
    providers: [
      adapter("gemini", unavailable("gemini")),
      adapter("groq", unavailable("groq")),
      adapter("cloudflare-workers-ai", async () => {
        calls.push("cloudflare");
        return { raw: rawResult };
      })
    ]
  });

  const result = await provider.research({ query: "Investigación técnica" });
  assert.deepEqual(calls, ["gemini", "groq", "cloudflare"]);
  assert.equal(result.answerProvider, "cloudflare-workers-ai");
  assert.equal(result.fallbackCount, 2);
  assert.equal(searchCalls.count, 1);
});

test("omite proveedores sin credenciales y no intenta habilitar facturación", async () => {
  const searchCalls = { count: 0 };
  const calls = [];
  const provider = createSequentialResearchProvider({
    searchProvider: searchProvider(searchCalls),
    providers: [
      adapter("gemini", async () => { calls.push("gemini"); return { raw: rawResult }; }, false),
      adapter("groq", async () => {
        calls.push("groq");
        throw Object.assign(new Error("billing"), { code: "PROVIDER_BILLING_REQUIRED" });
      }),
      adapter("cloudflare-workers-ai", async () => {
        calls.push("cloudflare");
        return { raw: rawResult };
      })
    ]
  });

  const result = await provider.research({ query: "Investigación técnica" });
  assert.deepEqual(calls, ["groq", "cloudflare"]);
  assert.equal(result.answerProvider, "cloudflare-workers-ai");
  assert.equal(result.providerAttempts[0].code, "PROVIDER_NOT_CONFIGURED");
  assert.equal(searchCalls.count, 1);
});

test("entrega fuentes de Tavily si los tres proveedores fallan", async () => {
  const searchCalls = { count: 0 };
  const unavailable = (code) => async () => {
    throw Object.assign(new Error("private provider detail"), { code });
  };
  const provider = createSequentialResearchProvider({
    searchProvider: searchProvider(searchCalls),
    providers: [
      adapter("gemini", unavailable("PROVIDER_RATE_LIMITED")),
      adapter("groq", unavailable("PROVIDER_TIMEOUT")),
      adapter("cloudflare-workers-ai", unavailable("PROVIDER_BILLING_REQUIRED"))
    ]
  });

  const result = await provider.research({ query: "Investigación técnica" });
  assert.equal(result.status, "sources_only");
  assert.equal(result.answerProvider, null);
  assert.equal(result.sources.length, 1);
  assert.equal(result.persistence, "sources_only_not_published");
  assert.equal(result.fallbackReason, "all_ai_providers_unavailable");
  assert.equal(JSON.stringify(result.providerAttempts).includes("private provider detail"), false);
  assert.equal(searchCalls.count, 1);
});

test("rechaza citas fuera de las fuentes y permite continuar al siguiente proveedor", async () => {
  const searchCalls = { count: 0 };
  const invalid = JSON.stringify({
    internalReport: "Informe con referencia [2].",
    visitorAnswer: "Respuesta breve.",
    expandedAnswer: "Ampliación.",
    claimEvidence: []
  });
  const calls = [];
  const provider = createSequentialResearchProvider({
    searchProvider: searchProvider(searchCalls),
    providers: [
      adapter("gemini", async () => { calls.push("gemini"); return { raw: invalid }; }),
      adapter("groq", async () => { calls.push("groq"); return { raw: rawResult }; })
    ]
  });

  const result = await provider.research({ query: "Investigación técnica" });
  assert.deepEqual(calls, ["gemini", "groq"]);
  assert.equal(result.answerProvider, "groq");
  assert.equal(searchCalls.count, 1);
});

test("construye adaptadores solo con las credenciales presentes y conserva modelos configurables", () => {
  const adapters = createProviderAdapters({
    env: {
      GEMINI_API_KEY: "gemini-test",
      GROQ_API_KEY: "",
      CLOUDFLARE_ACCOUNT_ID: "account-test",
      CLOUDFLARE_API_TOKEN: "token-test",
      CLOUDFLARE_AI_MODEL: "@cf/zai-org/glm-4.7-flash"
    },
    fetchImpl: async () => ({ ok: true, async json() { return {}; } })
  });
  assert.deepEqual(adapters.map((item) => item.configured), [true, false, true]);
  assert.deepEqual(adapters.map((item) => item.provider), [...PROVIDER_ORDER]);
});

test("rechaza un índice editorial inválido", () => {
  assert.throws(() => parseResearchOutput(JSON.stringify({
    internalReport: "Informe",
    visitorAnswer: "Respuesta",
    expandedAnswer: "Ampliación",
    claimEvidence: [{ section: "visitorAnswer", claim: "Afirmación respaldada correctamente.", assessment: "supported", sourceIds: [2] }]
  }), 1), { code: "INVALID_RESEARCH_OUTPUT" });
});
