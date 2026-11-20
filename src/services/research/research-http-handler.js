"use strict";

const {
  validateResearchRequest,
  ResearchConfigurationError,
  ResearchProviderError
} = require("./gemini-research-provider");
const {
  TavilyConfigurationError,
  TavilySearchError
} = require("./tavily-search-provider");

const MAX_BODY_BYTES = 8192;

function send(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function parseBody(req) {
  const length = Number(req.headers && req.headers["content-length"]);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    const error = new Error("El cuerpo de la solicitud supera el límite permitido.");
    error.code = "BODY_TOO_LARGE";
    throw error;
  }
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      const error = new Error("El cuerpo de la solicitud no contiene JSON válido.");
      error.code = "INVALID_JSON";
      throw error;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Se esperaba un objeto JSON.");
    error.code = "INVALID_BODY";
    throw error;
  }
  return body;
}

function createResearchHttpHandler(provider) {
  if (!provider || typeof provider.research !== "function") {
    throw new TypeError("Se requiere un proveedor con el método research().");
  }

  return async function researchHttpHandler(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Este recurso solo acepta POST." } });
    }

    let query;
    try {
      const body = parseBody(req);
      query = validateResearchRequest(body);
    } catch (error) {
      const status = error.code === "BODY_TOO_LARGE" ? 413 : 400;
      return send(res, status, { error: { code: error.code || "INVALID_REQUEST", message: error.message } });
    }

    try {
      console.info("[research:http] request_accepted");
      const result = await provider.research({ query });
      console.info("[research:http] request_completed", { sourceCount: Array.isArray(result.sources) ? result.sources.length : 0, persistence: result.persistence || "unknown" });
      return send(res, 200, {
        status: result.status,
        query: result.query,
        visitorAnswer: result.visitorAnswer,
        expandedAnswer: result.expandedAnswer,
        sources: Array.isArray(result.sources) ? result.sources : [],
        sourceCount: result.sourceCount || 0,
        persistence: result.persistence || "unknown",
        publication: result.publication || null,
        indexedChunks: result.indexedChunks || 0
      });
    } catch (error) {
      console.error("[research:http] request_failed", {
        name: error && error.name,
        code: error && error.code,
        message: error && typeof error.message === "string"
          ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500)
          : "Error sin mensaje"
      });
      if (error instanceof ResearchConfigurationError || error instanceof TavilyConfigurationError) {
        return send(res, 503, {
          error: {
            code: error.code,
            message: "El servicio de investigación no está configurado correctamente."
          }
        });
      }
      if (error instanceof ResearchProviderError || error instanceof TavilySearchError) {
        // El 429 público queda reservado al rate limiter de SERCO. Un límite del proveedor
        // externo es una indisponibilidad temporal y no debe mostrarse como cuota del visitante.
        const providerLimited = error.code === "RESEARCH_RATE_LIMITED";
        const status = providerLimited ? 503 : 502;
        return send(res, status, {
          error: {
            code: providerLimited ? "RESEARCH_PROVIDER_RATE_LIMITED" : error.code,
            message: "No fue posible completar la investigación en este momento."
          }
        });
      }
      return send(res, 500, { error: { code: "INTERNAL_ERROR", message: "Ocurrió un error interno." } });
    }
  };
}

module.exports = { createResearchHttpHandler, parseBody, MAX_BODY_BYTES };
