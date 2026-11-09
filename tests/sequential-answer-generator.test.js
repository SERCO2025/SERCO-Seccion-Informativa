"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSequentialAnswerGenerator,
  AIProvidersExhaustedError,
  PROVIDER_ORDER
} = require("../src/services/ai/sequential-answer-generator");

const input = {
  question: "¿Qué indica la ficha pública?",
  coverage: "sufficient",
  evidence: [{
    id: "chunk-001",
    articleId: "article-001",
    slug: "ficha-publica",
    title: "Ficha pública",
    version: 1,
    content: "La ficha indica un valor ficticio de 25 unidades."
  }]
};

function provider(name, generate, model) {
  return { provider: name, model: model || name + "-test-model", generate };
}

function validResult(text = "La ficha indica 25 unidades.") {
  return { text, citationIds: ["chunk-001"], model: "mock-model", usage: { totalTokens: 10 } };
}

test("mantiene el orden Gemini, Groq y Cloudflare", () => {
  assert.deepEqual(PROVIDER_ORDER, ["gemini", "groq", "cloudflare-workers-ai"]);
});

test("utiliza Gemini primero y no llama a los respaldos si responde correctamente", async () => {
  const calls = [];
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("cloudflare-workers-ai", async () => { calls.push("cloudflare"); return validResult(); }),
      provider("groq", async () => { calls.push("groq"); return validResult(); }),
      provider("gemini", async () => { calls.push("gemini"); return validResult(); })
    ]
  });

  const result = await generator.generate(input);
  assert.deepEqual(calls, ["gemini"]);
  assert.equal(result.provider, "gemini");
  assert.equal(result.fallbackCount, 0);
});

test("pasa a Groq cuando Gemini agota su cuota", async () => {
  const calls = [];
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("gemini", async () => {
        calls.push("gemini");
        const error = new Error("quota");
        error.code = "AI_PROVIDER_RATE_LIMITED";
        throw error;
      }),
      provider("groq", async () => { calls.push("groq"); return validResult(); }),
      provider("cloudflare-workers-ai", async () => { calls.push("cloudflare"); return validResult(); })
    ]
  });

  const result = await generator.generate(input);
  assert.deepEqual(calls, ["gemini", "groq"]);
  assert.equal(result.provider, "groq");
  assert.equal(result.fallbackCount, 1);
});

test("omite un proveedor sin credenciales y continúa en orden", async () => {
  const calls = [];
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("gemini", async () => {
        calls.push("gemini");
        const error = new Error("missing key");
        error.code = "AI_PROVIDER_NOT_CONFIGURED";
        throw error;
      }),
      provider("groq", async () => { calls.push("groq"); return validResult(); }),
      provider("cloudflare-workers-ai", async () => { calls.push("cloudflare"); return validResult(); })
    ]
  });

  const result = await generator.generate(input);
  assert.deepEqual(calls, ["gemini", "groq"]);
  assert.equal(result.provider, "groq");
});

test("pasa al siguiente proveedor si la respuesta cita evidencia ajena", async () => {
  const calls = [];
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("gemini", async () => {
        calls.push("gemini");
        return { text: "Respuesta sin respaldo.", citationIds: ["chunk-ajeno"] };
      }),
      provider("groq", async () => { calls.push("groq"); return validResult(); })
    ]
  });

  const result = await generator.generate(input);
  assert.deepEqual(calls, ["gemini", "groq"]);
  assert.equal(result.provider, "groq");
});

test("pasa al tercer proveedor cuando Gemini y Groq fallan", async () => {
  const calls = [];
  const unavailable = (name) => async () => {
    calls.push(name);
    const error = new Error("unavailable");
    error.code = "AI_PROVIDER_UNAVAILABLE";
    throw error;
  };
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("gemini", unavailable("gemini")),
      provider("groq", unavailable("groq")),
      provider("cloudflare-workers-ai", async () => {
        calls.push("cloudflare");
        return validResult();
      })
    ]
  });

  const result = await generator.generate(input);
  assert.deepEqual(calls, ["gemini", "groq", "cloudflare"]);
  assert.equal(result.provider, "cloudflare-workers-ai");
  assert.equal(result.fallbackCount, 2);
});

test("no cambia de proveedor ante una entrada inválida", async () => {
  let calls = 0;
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("gemini", async () => {
        calls += 1;
        const error = new Error("invalid");
        error.code = "AI_PROVIDER_INVALID_INPUT";
        throw error;
      }),
      provider("groq", async () => { calls += 1; return validResult(); })
    ]
  });

  await assert.rejects(
    generator.generate(input),
    { code: "AI_PROVIDER_INVALID_INPUT" }
  );
  assert.equal(calls, 1);
});

test("informa agotamiento total sin exponer mensajes ni credenciales", async () => {
  const generator = createSequentialAnswerGenerator({
    providers: [
      provider("gemini", async () => { throw new Error("secret detail"); }),
      provider("groq", async () => { throw new Error("secret detail"); }),
      provider("cloudflare-workers-ai", async () => { throw new Error("secret detail"); })
    ]
  });

  await assert.rejects(generator.generate(input), (error) => {
    assert.ok(error instanceof AIProvidersExhaustedError);
    assert.equal(error.code, "AI_PROVIDERS_EXHAUSTED");
    assert.deepEqual(error.attempts.map((item) => item.provider), [
      "gemini",
      "groq",
      "cloudflare-workers-ai"
    ]);
    assert.equal(JSON.stringify(error.attempts).includes("secret detail"), false);
    return true;
  });
});

test("rechaza la ejecución sin evidencia antes de llamar proveedores", async () => {
  let calls = 0;
  const generator = createSequentialAnswerGenerator({
    providers: [provider("gemini", async () => { calls += 1; return validResult(); })]
  });

  await assert.rejects(
    generator.generate({ ...input, evidence: [] }),
    { code: "AI_PROVIDER_INVALID_INPUT" }
  );
  assert.equal(calls, 0);
});
