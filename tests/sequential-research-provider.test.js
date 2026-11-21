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
  claimEvidence: [
    { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
    { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente [1].", assessment: "supported", sourceIds: [1] },
    { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
  ]
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

test("acepta un índice editorial que coincide literalmente con las tres secciones", () => {
  const parsed = parseResearchOutput(rawResult, 1);
  assert.equal(parsed.claimEvidence.length, 3);
});

test("rechaza un índice vacío cuando las respuestas contienen citas", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "Respuesta sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: []
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza afirmaciones del índice que no aparecen en la sección declarada", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "Respuesta sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Afirmación inventada fuera del informe [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza sourceIds que no coinciden con las referencias del fragmento", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "Respuesta sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente [1].", assessment: "supported", sourceIds: [2] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 2), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza sourceIds no citados en afirmaciones marcadas como inciertas", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "Respuesta sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente.", assessment: "uncertain", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza citas de una sección que no aparecen en su índice de afirmaciones", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "Respuesta sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [2].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 2), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza una oración citada que no tiene su propia entrada de evidencia", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1]. Otro dato sustantivo también cita [1].",
    visitorAnswer: "Respuesta sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Respuesta sustentada en la fuente [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza una segunda afirmación sin cita en la respuesta inicial", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "La primera afirmación está respaldada [1]. La segunda afirmación carece de referencia.",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "La primera afirmación está respaldada [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza una afirmación sin cita en la explicación ampliada", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "Respuesta inicial sustentada en la fuente [1].",
    expandedAnswer: "Explicación ampliada con referencia [1]. Una precisión factual adicional no tiene referencia.",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Respuesta inicial sustentada en la fuente [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("rechaza una afirmación sin cita cuando la oración comienza en minúscula", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "La primera afirmación está respaldada [1]. además, se agrega un dato factual sin referencia.",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "La primera afirmación está respaldada [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.throws(() => parseResearchOutput(raw, 1), { code: "INVALID_RESEARCH_OUTPUT" });
});

test("no confunde la abreviatura Dr. con el final de una oración", () => {
  const raw = JSON.stringify({
    internalReport: "Informe documental con referencia [1].",
    visitorAnswer: "El Dr. Pérez presentó el informe [1].",
    expandedAnswer: "Explicación ampliada con referencia [1].",
    claimEvidence: [
      { section: "internalReport", claim: "Informe documental con referencia [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "El Dr. Pérez presentó el informe [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "Explicación ampliada con referencia [1].", assessment: "supported", sourceIds: [1] }
    ]
  });
  assert.doesNotThrow(() => parseResearchOutput(raw, 1));
});

test("envía las solicitudes correctas a Gemini, Groq y Cloudflare Workers AI", async () => {
  const calls = [];
  const adapters = createProviderAdapters({
    env: {
      GEMINI_API_KEY: "gemini-test-key",
      GROQ_API_KEY: "groq-test-key",
      CLOUDFLARE_ACCOUNT_ID: "cf-account-test",
      CLOUDFLARE_API_TOKEN: "cf-token-test"
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      if (url.includes("generativelanguage.googleapis.com")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { candidates: [{ content: { parts: [{ text: rawResult }] } }] };
          }
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { choices: [{ message: { content: rawResult } }] };
        }
      };
    }
  });

  const prompt = { system: "Instrucciones de prueba", user: "Consulta de prueba" };
  const generated = [];
  for (const item of adapters) generated.push(await item.generate(prompt));

  assert.equal(generated.every((item) => item.raw === rawResult), true);
  assert.equal(calls.length, 3);

  assert.match(calls[0].url, /gemini-3\.8-flash:generateContent$/);
  assert.equal(calls[0].init.headers["x-goog-api-key"], "gemini-test-key");
  assert.equal(calls[0].body.generationConfig.responseMimeType, "application/json");

  assert.equal(calls[1].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[1].init.headers.Authorization, "Bearer groq-test-key");
  assert.equal(calls[1].body.model, DEFAULT_MODELS.groq);
  assert.deepEqual(calls[1].body.response_format, { type: "json_object" });

  assert.equal(calls[2].url, "https://api.cloudflare.com/client/v4/accounts/cf-account-test/ai/v1/chat/completions");
  assert.equal(calls[2].init.headers.Authorization, "Bearer cf-token-test");
  assert.equal(calls[2].body.model, DEFAULT_MODELS["cloudflare-workers-ai"]);
  assert.equal(Object.hasOwn(calls[2].body, "response_format"), false);
});

test("clasifica el límite 429 del proveedor para activar el siguiente motor", async () => {
  const adapters = createProviderAdapters({
    env: { GEMINI_API_KEY: "gemini-test-key" },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      async json() {
        throw new SyntaxError("empty or non-JSON body");
      }
    })
  });

  await assert.rejects(
    adapters[0].generate({ system: "Sistema", user: "Consulta" }),
    { code: "PROVIDER_RATE_LIMITED" }
  );
});

test("clasifica errores HTTP 5xx aunque el cuerpo del proveedor no sea JSON", async () => {
  const adapters = createProviderAdapters({
    env: { CLOUDFLARE_ACCOUNT_ID: "cf-account-test", CLOUDFLARE_API_TOKEN: "cf-token-test" },
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() { throw new SyntaxError("non-JSON upstream response"); }
    })
  });

  await assert.rejects(
    adapters[2].generate({ system: "Sistema", user: "Consulta" }),
    { code: "PROVIDER_UPSTREAM_ERROR" }
  );
});

test("clasifica credenciales rechazadas sin exponer el detalle remoto", async () => {
  const adapters = createProviderAdapters({
    env: { GROQ_API_KEY: "groq-test-key" },
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      async json() {
        throw new SyntaxError("non-JSON body");
      }
    })
  });

  await assert.rejects(
    adapters[1].generate({ system: "Sistema", user: "Consulta" }),
    (error) => {
      assert.equal(error.code, "PROVIDER_ACCESS_DENIED");
      assert.equal(error.message.includes("private credential detail"), false);
      return true;
    }
  );
});

