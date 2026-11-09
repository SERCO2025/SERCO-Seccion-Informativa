"use strict";

const {
  AIProviderConfigurationError,
  validateGenerationInput,
  buildSystemPrompt,
  buildUserPrompt,
  parseGeneratedAnswer,
  postJson
} = require("../provider-utils");

const DEFAULT_MODEL = "gemini-3.8-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

function createGeminiAnswerProvider(options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
  const model = options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    provider: "gemini",
    model,
    async generate(input) {
      const normalized = validateGenerationInput(input);
      if (!apiKey) {
        throw new AIProviderConfigurationError("Falta configurar GEMINI_API_KEY en el servidor.");
      }

      const payload = await postJson(
        fetchImpl,
        API_BASE + encodeURIComponent(model) + ":generateContent",
        { "x-goog-api-key": apiKey },
        {
          systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(normalized) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                text: { type: "STRING" },
                citationIds: { type: "ARRAY", items: { type: "STRING" } }
              },
              required: ["text", "citationIds"]
            }
          }
        },
        "Gemini"
      );

      const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : null;
      const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
        ? candidate.content.parts
        : [];
      const output = parts.filter((part) => typeof part.text === "string").map((part) => part.text).join("\n");
      const result = parseGeneratedAnswer(output);
      return Object.assign(result, {
        provider: "gemini",
        model,
        usage: payload.usageMetadata || null
      });
    }
  };
}

module.exports = { createGeminiAnswerProvider, DEFAULT_MODEL };
