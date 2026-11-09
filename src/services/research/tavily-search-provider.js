"use strict";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const MAX_QUERY_LENGTH = 2000;
const MAX_RESULTS = 8;

class TavilyConfigurationError extends Error {
  constructor(message, code = "RESEARCH_NOT_CONFIGURED") {
    super(message);
    this.name = "TavilyConfigurationError";
    this.code = code;
  }
}

class TavilySearchError extends Error {
  constructor(message, code = "RESEARCH_PROVIDER_ERROR") {
    super(message);
    this.name = "TavilySearchError";
    this.code = code;
  }
}

function validateTavilyQuery(input) {
  const query = input && typeof input.query === "string" ? input.query.trim() : "";
  if (query.length < 3 || query.length > MAX_QUERY_LENGTH ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(query)) {
    const error = new Error("La consulta debe tener entre 3 y 2000 caracteres y no contener controles.");
    error.code = "INVALID_RESEARCH_QUERY";
    throw error;
  }
  return query;
}

function normalizeTavilyResults(payload) {
  const results = payload && Array.isArray(payload.results) ? payload.results : [];
  const unique = new Map();
  for (const item of results) {
    if (!item || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    const url = item.url.trim();
    if (!unique.has(url)) {
      unique.set(url, {
        url,
        title: typeof item.title === "string" ? item.title.trim() : "",
        content: typeof item.content === "string" ? item.content.trim() : "",
        score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null,
        publishedDate: typeof item.published_date === "string" ? item.published_date : null
      });
    }
  }
  return [...unique.values()].slice(0, MAX_RESULTS);
}

function createTavilySearchProvider(options = {}) {
  const apiKey = options.apiKey || process.env.TAVILY_API_KEY || "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const searchDepth = options.searchDepth || "basic";
  const maxResults = Number.isInteger(options.maxResults)
    ? Math.min(Math.max(options.maxResults, 1), MAX_RESULTS)
    : MAX_RESULTS;

  return {
    async search(input) {
      const query = validateTavilyQuery(input);
      if (!apiKey) {
        throw new TavilyConfigurationError("Falta configurar TAVILY_API_KEY en el entorno del servidor.");
      }
      if (typeof fetchImpl !== "function") {
        throw new TavilyConfigurationError("El entorno no dispone de fetch para conectar con Tavily.");
      }

      let response;
      try {
        response = await fetchImpl(TAVILY_SEARCH_URL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            query,
            search_depth: searchDepth,
            topic: "general",
            max_results: maxResults,
            include_answer: false,
            include_raw_content: false,
            include_usage: true
          })
        });
      } catch {
        throw new TavilySearchError("No fue posible conectar con el servicio de búsqueda Tavily.", "TAVILY_CONNECTION_ERROR");
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new TavilySearchError("Tavily devolvió una respuesta que no es JSON válido.", "TAVILY_INVALID_RESPONSE");
      }

      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          throw new TavilyConfigurationError("La credencial de Tavily no fue aceptada.", "TAVILY_CREDENTIAL_INVALID");
        }
        if ([429, 432, 433].includes(response.status)) {
          throw new TavilySearchError("Tavily alcanzó un límite de solicitudes o créditos.", "RESEARCH_RATE_LIMITED");
        }
        throw new TavilySearchError("Tavily no pudo completar la búsqueda.", "TAVILY_UPSTREAM_ERROR");
      }

      const results = normalizeTavilyResults(payload);
      if (results.length === 0) {
        throw new TavilySearchError("Tavily no devolvió resultados web utilizables.", "NO_SEARCH_RESULTS");
      }

      return {
        provider: "tavily",
        query,
        results,
        resultCount: results.length,
        usage: payload.usage && typeof payload.usage === "object" ? payload.usage : null,
        requestId: typeof payload.request_id === "string" ? payload.request_id : null
      };
    }
  };
}

module.exports = {
  createTavilySearchProvider,
  validateTavilyQuery,
  normalizeTavilyResults,
  TavilyConfigurationError,
  TavilySearchError,
  TAVILY_SEARCH_URL
};
