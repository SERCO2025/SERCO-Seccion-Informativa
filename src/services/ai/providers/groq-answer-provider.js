"use strict";

const {
  AIProviderConfigurationError,
  validateGenerationInput,
  buildSystemPrompt,
  buildUserPrompt,
  parseGeneratedAnswer,
  postJson
} = require("../provider-utils");

const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

function createGroqAnswerProvider(options = {}) {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY || "";
  const model = options.model || process.env.GROQ_MODEL || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    provider: "groq",
    model,
    async generate(input) {
      const normalized = validateGenerationInput(input);
      if (!apiKey) {
        throw new AIProviderConfigurationError("Falta configurar GROQ_API_KEY en el servidor.");
      }

      const payload = await postJson(
        fetchImpl,
        API_URL,
        { Authorization: "Bearer " + apiKey },
        {
          model,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(normalized) }
          ],
          temperature: 0.2,
          max_completion_tokens: 1200,
          response_format: { type: "json_object" },
          stream: false
        },
        "Groq"
      );

      const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
      const output = choice && choice.message ? choice.message.content : "";
      const result = parseGeneratedAnswer(output);
      return Object.assign(result, {
        provider: "groq",
        model,
        usage: payload.usage || null
      });
    }
  };
}

module.exports = { createGroqAnswerProvider, DEFAULT_MODEL };
