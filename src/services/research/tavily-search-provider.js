"use strict";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
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

function normalizeTavilyImageReferences(items, fallbackSourceUrl) {
  const unique = new Map();
  for (const image of Array.isArray(items) ? items : []) {
    const value = typeof image === "string" ? { url: image } : image;
    const rawUrl = value && (value.url || value.image_url || value.src);
    if (typeof rawUrl !== "string" || !/^https:\/\//i.test(rawUrl)) continue;
    const url = rawUrl.trim();
    if (!unique.has(url)) unique.set(url, {
      url,
      description: String(value.description || value.caption || "").trim().slice(0, 500),
      alt: String(value.alt || value.title || value.description || "").trim().slice(0, 300),
      sourceUrl: typeof (value.source_url || value.sourceUrl || value.page_url) === "string"
        ? (value.source_url || value.sourceUrl || value.page_url)
        : fallbackSourceUrl
    });
  }
  return [...unique.values()].slice(0, 12);
}

function normalizeTavilyResults(payload) {
  const results = payload && Array.isArray(payload.results) ? payload.results : [];
  const topLevelImages = payload && Array.isArray(payload.images) ? payload.images : [];
  const unique = new Map();
  for (const item of results) {
    if (!item || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    const url = item.url.trim();
    if (!unique.has(url)) {
      const linkedTopLevelImages = topLevelImages.filter(image => {
        const sourceUrl = image && (image.source_url || image.sourceUrl || image.page_url);
        return typeof sourceUrl === "string" && sourceUrl.split("#")[0] === url.split("#")[0];
      });
      unique.set(url, {
        url,
        title: typeof item.title === "string" ? item.title.trim() : "",
        content: typeof item.content === "string" ? item.content.trim() : "",
        rawContent: typeof item.raw_content === "string" ? item.raw_content.trim() : "",
        score: typeof item.score === "number" && Number.isFinite(item.score) ? item.score : null,
        publishedDate: typeof item.published_date === "string" ? item.published_date : null,
        images: normalizeTavilyImageReferences([...(Array.isArray(item.images) ? item.images : []), ...linkedTopLevelImages], url)
      });
    }
  }
  return [...unique.values()].slice(0, MAX_RESULTS);
}

function normalizeTavilyExtractResults(payload) {
  const results = payload && Array.isArray(payload.results) ? payload.results : [];
  const unique = new Map();
  for (const item of results) {
    if (!item || typeof item.url !== "string" || !/^https?:\/\//i.test(item.url)) continue;
    const url = item.url.trim();
    const rawContent = typeof item.raw_content === "string" ? item.raw_content.trim() : "";
    if (!rawContent) continue;
    let canonicalUrl;
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      canonicalUrl = parsed.toString();
    } catch { continue; }
    if (!unique.has(canonicalUrl)) unique.set(canonicalUrl, { url, rawContent });
  }
  return [...unique.values()];
}

function createTavilySearchProvider(options = {}) {
  const apiKey = options.apiKey || process.env.TAVILY_API_KEY || "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const searchDepth = options.searchDepth || "basic";
  const includeImages = options.includeImages !== false && process.env.TAVILY_INCLUDE_IMAGES_ENABLED !== "false";
  // Extract consumes additional Tavily credits; require explicit server-side opt-in.
  const extractEnabled = options.extractEnabled === true ||
    (options.extractEnabled !== false && process.env.TAVILY_EXTRACT_ENABLED === "true");
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
      console.info("[research:tavily] request_started");
      try {
        response = await fetchImpl(TAVILY_SEARCH_URL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json"
          },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            query,
            search_depth: searchDepth,
            topic: "general",
            max_results: maxResults,
            include_answer: false,
            include_raw_content: false,
            include_images: includeImages,
            include_image_descriptions: includeImages,
            include_usage: true
          })
        });
      } catch (error) {
        console.error("[research:tavily] request_failed", { name: error && error.name, code: error && error.code });
        throw new TavilySearchError("No fue posible conectar con el servicio de búsqueda Tavily.", "TAVILY_CONNECTION_ERROR");
      }

      console.info("[research:tavily] response_received", { status: response.status, ok: response.ok });

      // El estado HTTP es la señal primaria: los cuerpos de error pueden estar vacíos
      // o no ser JSON, especialmente cuando el servicio aplica límites o falla.
      if (!response.ok) {
        if ([401, 403].includes(response.status)) {
          throw new TavilyConfigurationError("La credencial de Tavily no fue aceptada.", "TAVILY_CREDENTIAL_INVALID");
        }
        if ([429, 432, 433].includes(response.status)) {
          throw new TavilySearchError("Tavily alcanzó un límite de solicitudes o créditos.", "RESEARCH_RATE_LIMITED");
        }
        throw new TavilySearchError("Tavily no pudo completar la búsqueda.", "TAVILY_UPSTREAM_ERROR");
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        console.error("[research:tavily] response_parse_failed", { name: error && error.name, code: error && error.code });
        throw new TavilySearchError("Tavily devolvió una respuesta que no es JSON válido.", "TAVILY_INVALID_RESPONSE");
      }

      const results = normalizeTavilyResults(payload);
      console.info("[research:tavily] results_normalized", {
        resultCount: results.length,
        imageCount: results.reduce((total, source) => total + (source.images ? source.images.length : 0), 0),
        reportedCredits: payload.usage && Number.isFinite(payload.usage.credits) ? payload.usage.credits : null
      });
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
    },

    async extract(input) {
      if (!extractEnabled) {
        console.info("[research:tavily] extract_skipped", { reason: "feature_disabled" });
        return { provider: "tavily", results: [], resultCount: 0, usage: null, requestId: null, enabled: false };
      }
      const urls = Array.isArray(input && input.urls)
        ? [...new Set(input.urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)).slice(0, MAX_RESULTS))]
        : [];
      const query = typeof (input && input.query) === "string" ? input.query.trim().slice(0, MAX_QUERY_LENGTH) : "";
      if (!urls.length) throw new TavilySearchError("No hay URL válidas para extraer contenido.", "INVALID_EXTRACT_URLS");
      if (!apiKey) throw new TavilyConfigurationError("Falta configurar TAVILY_API_KEY en el entorno del servidor.");
      if (typeof fetchImpl !== "function") throw new TavilyConfigurationError("El entorno no dispone de fetch para conectar con Tavily.");

      let response;
      console.info("[research:tavily] extract_started", { urlCount: urls.length });
      try {
        response = await fetchImpl(TAVILY_EXTRACT_URL, {
          method: "POST",
          headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            urls, query, chunks_per_source: 3, extract_depth: "basic",
            format: "markdown", timeout: 20, include_usage: true
          })
        });
      } catch (error) {
        const timeout = error && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new TavilySearchError(
          timeout ? "La extracción de contenido excedió el tiempo máximo." : "No fue posible conectar con Tavily Extract.",
          timeout ? "TAVILY_EXTRACT_TIMEOUT" : "TAVILY_EXTRACT_CONNECTION_ERROR"
        );
      }

      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new TavilyConfigurationError("La credencial de Tavily no fue aceptada.", "TAVILY_CREDENTIAL_INVALID");
        if ([429, 432, 433].includes(response.status)) throw new TavilySearchError("Tavily alcanzó un límite de solicitudes o créditos.", "RESEARCH_RATE_LIMITED");
        throw new TavilySearchError("Tavily no pudo extraer el contenido de las fuentes.", "TAVILY_EXTRACT_UPSTREAM_ERROR");
      }

      let payload;
      try { payload = await response.json(); }
      catch { throw new TavilySearchError("Tavily Extract devolvió una respuesta no válida.", "TAVILY_EXTRACT_INVALID_RESPONSE"); }

      const extracted = normalizeTavilyExtractResults(payload);
      console.info("[research:tavily] extract_completed", {
        requestedCount: urls.length,
        extractedCount: extracted.length,
        failedCount: Array.isArray(payload.failed_results) ? payload.failed_results.length : 0
      });
      return {
        provider: "tavily", results: extracted, resultCount: extracted.length,
        usage: payload.usage && typeof payload.usage === "object" ? payload.usage : null,
        requestId: typeof payload.request_id === "string" ? payload.request_id : null,
        enabled: true
      };
    }
  };
}

module.exports = {
  createTavilySearchProvider,
  validateTavilyQuery,
  normalizeTavilyResults,
  normalizeTavilyExtractResults,
  TavilyConfigurationError,
  TavilySearchError,
  TAVILY_SEARCH_URL,
  TAVILY_EXTRACT_URL
};
