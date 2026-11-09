"use strict";

const {
  AIProviderConfigurationError,
  validateGenerationInput,
  buildSystemPrompt,
  buildUserPrompt,
  parseGeneratedAnswer,
  postJson
} = require("../provider-utils");

const API_BASE = "https://api.cloudflare.com/client/v4/accounts/";
const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

function createCloudflareAnswerProvider(options = {}) {
  const accountId = options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || "";
  const apiToken = options.apiToken || process.env.CLOUDFLARE_API_TOKEN || "";
  const model = options.model || process.env.CLOUDFLARE_AI_MODEL || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    provider: "cloudflare-workers-ai",
    model,
    async generate(input) {
      const normalized = validateGenerationInput(input);
      if (!accountId || !apiToken) {
        throw new AIProviderConfigurationError("Faltan CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_API_TOKEN en el servidor.");
      }

      const payload = await postJson(
        fetchImpl,
        API_BASE + encodeURIComponent(accountId) + "/ai/v1/chat/completions",
        { Authorization: "Bearer " + apiToken },
        {
          model,
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: buildUserPrompt(normalized) }
          ],
          temperature: 0.2,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          stream: false
        },
        "Cloudflare Workers AI"
      );

      const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
      const output = choice && choice.message ? choice.message.content : "";
      const result = parseGeneratedAnswer(output);
      return Object.assign(result, {
        provider: "cloudflare-workers-ai",
        model,
        usage: payload.usage || null
      });
    }
  };
}

module.exports = { createCloudflareAnswerProvider, DEFAULT_MODEL };
