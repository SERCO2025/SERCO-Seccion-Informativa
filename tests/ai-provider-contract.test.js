"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AIProviderError,
  AIProviderConfigurationError
} = require("../src/services/ai/provider-utils");
const { createGeminiAnswerProvider } = require("../src/services/ai/providers/gemini-answer-provider");
const { createGroqAnswerProvider } = require("../src/services/ai/providers/groq-answer-provider");
const { createCloudflareAnswerProvider } = require("../src/services/ai/providers/cloudflare-answer-provider");

const input = {
  question: "¿Qué indica el documento de prueba?",
  coverage: "sufficient",
  evidence: [{
    id: "chunk-001",
    articleId: "article-001",
    slug: "documento-de-prueba",
    title: "Documento de prueba",
    version: 1,
    section: "Dato principal",
    content: "El documento ficticio indica que el parámetro de prueba es 25 unidades."
  }],
  instructions: { useOnlyProvidedEvidence: true }
};

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

test("Gemini usa su endpoint, clave en header y salida JSON estructurada", async () => {
  let captured;
  const provider = createGeminiAnswerProvider({
    apiKey: "test-gemini-key",
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return response({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          text: "El documento indica 25 unidades.",
          citationIds: ["chunk-001"]
        }) }] } }],
        usageMetadata: { totalTokenCount: 42 }
      });
    }
  });

  const result = await provider.generate(input);
  assert.match(captured.url, /gemini-3\.8-flash:generateContent$/);
  assert.equal(captured.options.headers["x-goog-api-key"], "test-gemini-key");
  assert.equal(captured.body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(result.citationIds, ["chunk-001"]);
  assert.equal(result.provider, "gemini");
});

test("Groq usa el modelo GPT-OSS 120B y modo JSON", async () => {
  let captured;
  const provider = createGroqAnswerProvider({
    apiKey: "test-groq-key",
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return response({
        choices: [{ message: { content: JSON.stringify({
          text: "El documento indica 25 unidades.",
          citationIds: ["chunk-001"]
        }) } }],
        usage: { total_tokens: 42 }
      });
    }
  });

  const result = await provider.generate(input);
  assert.equal(captured.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(captured.body.model, "openai/gpt-oss-120b");
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
  assert.equal(captured.options.headers.Authorization, "Bearer test-groq-key");
  assert.equal(result.provider, "groq");
});

test("Cloudflare usa Workers AI con el modelo GLM 4.7 Flash", async () => {
  let captured;
  const provider = createCloudflareAnswerProvider({
    accountId: "account-test",
    apiToken: "test-cloudflare-token",
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return response({
        choices: [{ message: { content: JSON.stringify({
          text: "El documento indica 25 unidades.",
          citationIds: ["chunk-001"]
        }) } }],
        usage: { total_tokens: 42 }
      });
    }
  });

  const result = await provider.generate(input);
  assert.equal(
    captured.url,
    "https://api.cloudflare.com/client/v4/accounts/account-test/ai/v1/chat/completions"
  );
  assert.equal(captured.body.model, "@cf/zai-org/glm-4.7-flash");
  assert.equal(captured.options.headers.Authorization, "Bearer test-cloudflare-token");
  assert.equal(result.provider, "cloudflare-workers-ai");
});

test("no realiza llamadas si falta una credencial", async () => {
  let calls = 0;
  const provider = createGeminiAnswerProvider({ apiKey: "", fetchImpl: async () => { calls += 1; } });
  await assert.rejects(provider.generate(input), AIProviderConfigurationError);
  assert.equal(calls, 0);
});

test("detiene el proveedor si exige facturación", async () => {
  const provider = createGroqAnswerProvider({
    apiKey: "test-key",
    fetchImpl: async () => response({ error: { message: "billing required" } }, 402)
  });
  await assert.rejects(
    provider.generate(input),
    (error) => error instanceof AIProviderConfigurationError && error.code === "AI_PROVIDER_BILLING_REQUIRED"
  );
});

test("convierte el límite gratuito agotado en error controlado", async () => {
  const provider = createCloudflareAnswerProvider({
    accountId: "account-test",
    apiToken: "test-token",
    fetchImpl: async () => response({ error: "rate limited" }, 429)
  });
  await assert.rejects(
    provider.generate(input),
    (error) => error instanceof AIProviderError && error.code === "AI_PROVIDER_RATE_LIMITED"
  );
});

test("rechaza citas duplicadas y JSON inválido", async () => {
  const duplicate = createGroqAnswerProvider({
    apiKey: "test-key",
    fetchImpl: async () => response({
      choices: [{ message: { content: JSON.stringify({
        text: "Respuesta",
        citationIds: ["chunk-001", "chunk-001"]
      }) } }]
    })
  });
  await assert.rejects(duplicate.generate(input), { code: "AI_PROVIDER_INVALID_OUTPUT" });

  const malformed = createGroqAnswerProvider({
    apiKey: "test-key",
    fetchImpl: async () => response({ choices: [{ message: { content: "no es json" } }] })
  });
  await assert.rejects(malformed.generate(input), { code: "AI_PROVIDER_INVALID_JSON" });
});

test("rechaza evidencia vacía o identificadores duplicados antes de llamar al proveedor", async () => {
  let calls = 0;
  const provider = createGroqAnswerProvider({
    apiKey: "test-key",
    fetchImpl: async () => { calls += 1; return response({}); }
  });
  await assert.rejects(provider.generate({ ...input, evidence: [] }), { code: "AI_PROVIDER_INVALID_INPUT" });
  await assert.rejects(provider.generate({
    ...input,
    evidence: [input.evidence[0], input.evidence[0]]
  }), { code: "AI_PROVIDER_INVALID_INPUT" });
  assert.equal(calls, 0);
});
