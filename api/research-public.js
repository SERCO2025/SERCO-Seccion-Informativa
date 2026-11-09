"use strict";

const { createTavilySearchProvider } = require("../src/services/research/tavily-search-provider");
const { createGeminiResearchProvider } = require("../src/services/research/gemini-research-provider");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");
const {
  createPublicRateLimiter,
  PublicRateLimitConfigurationError
} = require("../src/services/security/public-api-rate-limiter");

const tavilySearchProvider = createTavilySearchProvider();
const provider = createGeminiResearchProvider({ searchProvider: tavilySearchProvider });
const handler = createResearchHttpHandler(provider);
const rateLimiter = createPublicRateLimiter();

module.exports = async function publicResearchApi(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Este recurso solo acepta solicitudes POST."
      }
    });
  }

  try {
    const allowed = await rateLimiter.consume(req, "research");
    if (!allowed) {
      return res.status(429).json({
        error: {
          code: "PUBLIC_RATE_LIMITED",
          message: "Se alcanzó el límite temporal de investigaciones. Inténtalo más tarde."
        }
      });
    }
  } catch (error) {
    const configurationError = error instanceof PublicRateLimitConfigurationError;
    return res.status(503).json({
      error: {
        code: configurationError ? error.code : "PUBLIC_RATE_LIMIT_UNAVAILABLE",
        message: "La investigación externa no está disponible temporalmente."
      }
    });
  }

  return handler(req, res);
};
