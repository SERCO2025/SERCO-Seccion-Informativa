"use strict";

const { AIProviderError } = require("./provider-utils");
const { createGeminiAnswerProvider } = require("./providers/gemini-answer-provider");
const { createGroqAnswerProvider } = require("./providers/groq-answer-provider");
const { createCloudflareAnswerProvider } = require("./providers/cloudflare-answer-provider");

const PROVIDER_ORDER = Object.freeze(["gemini", "groq", "cloudflare-workers-ai"]);

class AIProvidersExhaustedError extends AIProviderError {
  constructor(attempts) {
    super(
      "Ninguno de los proveedores de IA disponibles pudo generar una respuesta verificable.",
      "AI_PROVIDERS_EXHAUSTED"
    );
    this.name = "AIProvidersExhaustedError";
    this.attempts = attempts;
  }
}

function validateProviderResult(result, evidence) {
  if (!result || typeof result.text !== "string" || !result.text.trim()) {
    throw new AIProviderError(
      "El proveedor no devolvió una respuesta utilizable.",
      "AI_PROVIDER_INVALID_OUTPUT"
    );
  }

  if (
    !Array.isArray(result.citationIds) ||
    result.citationIds.length === 0 ||
    result.citationIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new AIProviderError(
      "El proveedor no devolvió referencias verificables.",
      "AI_PROVIDER_INVALID_OUTPUT"
    );
  }

  const evidenceIds = new Set(evidence.map((item) => item.id));
  const citationIds = new Set();

  for (const id of result.citationIds) {
    if (citationIds.has(id)) {
      throw new AIProviderError(
        "El proveedor devolvió referencias duplicadas.",
        "AI_PROVIDER_INVALID_OUTPUT"
      );
    }
    if (!evidenceIds.has(id)) {
      throw new AIProviderError(
        "El proveedor citó evidencia que no fue recuperada.",
        "AI_PROVIDER_UNVERIFIED_CITATION"
      );
    }
    citationIds.add(id);
  }
}

function createSequentialAnswerGenerator(options = {}) {
  const providers = Array.isArray(options.providers)
    ? options.providers
    : [
        createGeminiAnswerProvider(options.gemini),
        createGroqAnswerProvider(options.groq),
        createCloudflareAnswerProvider(options.cloudflare)
      ];

  const expectedOrder = new Map(PROVIDER_ORDER.map((name, index) => [name, index]));
  const orderedProviders = [...providers].sort((a, b) => {
    const aIndex = expectedOrder.has(a.provider) ? expectedOrder.get(a.provider) : Number.MAX_SAFE_INTEGER;
    const bIndex = expectedOrder.has(b.provider) ? expectedOrder.get(b.provider) : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });

  return {
    provider: "sequential-failover",
    order: PROVIDER_ORDER,
    async generate(input) {
      if (!input || !Array.isArray(input.evidence) || input.evidence.length === 0) {
        throw new AIProviderError(
          "La selección de proveedor requiere evidencia recuperada.",
          "AI_PROVIDER_INVALID_INPUT"
        );
      }

      const attempts = [];

      for (const provider of orderedProviders) {
        if (!provider || typeof provider.generate !== "function" || !PROVIDER_ORDER.includes(provider.provider)) {
          attempts.push({
            provider: provider && provider.provider ? provider.provider : "unknown",
            code: "AI_PROVIDER_INVALID_ADAPTER"
          });
          continue;
        }

        try {
          const result = await provider.generate(input);
          validateProviderResult(result, input.evidence);

          return {
            text: result.text.trim(),
            citationIds: result.citationIds,
            provider: provider.provider,
            model: result.model || provider.model || null,
            usage: result.usage || null,
            fallbackCount: attempts.length
          };
        } catch (error) {
          if (error && error.code === "AI_PROVIDER_INVALID_INPUT") {
            throw error;
          }

          attempts.push({
            provider: provider.provider,
            model: provider.model || null,
            code: error && typeof error.code === "string" ? error.code : "AI_PROVIDER_ERROR"
          });
        }
      }

      throw new AIProvidersExhaustedError(attempts);
    }
  };
}

module.exports = {
  PROVIDER_ORDER,
  AIProvidersExhaustedError,
  createSequentialAnswerGenerator,
  validateProviderResult
};
