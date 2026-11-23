"use strict";

const {
  buildResearchPrompt,
  parseResearchOutput
} = require("../research/sequential-research-provider");

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "inclusionai/ling-3.2-flash:free";

function createOpenRouterPublisher(options = {}) {
  const apiKey = options.apiKey !== undefined ? options.apiKey : (process.env.OPENROUTER_PUBLISHER_API_KEY || "");
  const model = options.model || process.env.OPENROUTER_PUBLISHER_MODEL || DEFAULT_MODEL;
  const searchProvider = options.searchProvider;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : 45000;

  return {
    provider: "openrouter",
    model,
    configured: Boolean(apiKey && searchProvider && typeof fetchImpl === "function"),

    async research(input) {
      if (!apiKey) {
        const error = new Error("Falta configurar OPENROUTER_PUBLISHER_API_KEY.");
        error.code = "PUBLISHER_PROVIDER_NOT_CONFIGURED";
        throw error;
      }
      if (!model.endsWith(":free")) {
        const error = new Error("El publicador solo permite modelos gratuitos de OpenRouter.");
        error.code = "PUBLISHER_MODEL_NOT_FREE";
        throw error;
      }
      if (!searchProvider || typeof searchProvider.search !== "function") {
        const error = new Error("El publicador no tiene un proveedor de búsqueda configurado.");
        error.code = "PUBLISHER_SEARCH_NOT_CONFIGURED";
        throw error;
      }
      if (typeof fetchImpl !== "function") {
        const error = new Error("El entorno no dispone de fetch para conectar con OpenRouter.");
        error.code = "PUBLISHER_FETCH_UNAVAILABLE";
        throw error;
      }

      const query = input && typeof input.query === "string" ? input.query.trim() : "";
      if (query.length < 3 || query.length > 2000) {
        const error = new Error("La consulta del publicador debe tener entre 3 y 2000 caracteres.");
        error.code = "INVALID_RESEARCH_QUERY";
        throw error;
      }

      const searchResult = await searchProvider.search({ query });
      const sources = (Array.isArray(searchResult.results) ? searchResult.results : [])
        .filter((source) => source && typeof source.url === "string" && typeof source.title === "string")
        .map((source, index) => ({
          id: index + 1,
          title: source.title,
          url: source.url,
          publishedDate: source.publishedDate || null,
          score: typeof source.score === "number" ? source.score : null,
          excerpt: String(source.content || source.snippet || source.excerpt || "").trim(),
          extractedContent: String(source.rawContent || "").trim(),
          evidenceText: String(source.rawContent || source.content || source.snippet || source.excerpt || "").trim(),
          evidenceOrigin: source.rawContent ? "tavily_extract" : "tavily_search_excerpt"
        }));

      if (sources.length < 2) {
        const error = new Error("La investigación del publicador no reunió al menos dos fuentes utilizables.");
        error.code = "INSUFFICIENT_PUBLISHER_SOURCES";
        throw error;
      }

      const prompt = buildResearchPrompt(query, sources);
      prompt.system += [
        "",
        "INSTRUCCIONES ESPECÍFICAS DEL PUBLICADOR EDITORIAL DE SERCO:",
        "La sección expandedAnswer debe ser una entrada técnica de diccionario extensa, autosuficiente y rigurosa, no una respuesta breve de chat. Debe superar 1,200 caracteres y desarrollar definición, fundamentos, clasificación, aplicaciones en edificación u obra civil, criterios técnicos, métodos de ejecución o ensayo, control de calidad, seguridad, normativa y limitaciones pertinentes al tema.",
        "La sección internalReport también debe superar 1,200 caracteres e incluir contraste documental, autoridad y alcance de las fuentes, jurisdicción y vigencia de normas, discrepancias, limitaciones y datos que no pudieron confirmarse.",
        "La sección visitorAnswer puede ser una síntesis breve y directa. No reduzcas expandedAnswer para ajustarla a la longitud de visitorAnswer.",
        "Evalúa fuentes técnicas privadas, fabricantes, laboratorios, constructoras y despachos profesionales por su documentación, autoría, metodología, evidencia y referencias; no las descartes por su dominio comercial. No inventes datos, normas, ensayos, autores ni resultados.",
        "Mantén las referencias [n] exactamente alineadas con las fuentes entregadas. El índice claimEvidence debe cumplir íntegramente el formato y la correspondencia exigidos."
      ].join("\n");

      let response;
      try {
        response = await fetchImpl(OPENROUTER_CHAT_URL, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://seccion-informativa.vercel.app",
            "X-Title": "SERCO Publicador editorial"
          },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
            reasoning: { enabled: false },
            max_tokens: 12000,
            stream: false
          })
        });
      } catch (cause) {
        const error = new Error("No fue posible conectar con el proveedor independiente del publicador.");
        error.code = "AI_PROVIDERS_UNAVAILABLE";
        error.cause = cause;
        throw error;
      }

      if (!response.ok) {
        const code = response.status === 401 || response.status === 403
          ? "PUBLISHER_CREDENTIAL_INVALID"
          : response.status === 429 || response.status >= 500
            ? "AI_PROVIDERS_UNAVAILABLE"
            : "PUBLISHER_UPSTREAM_ERROR";
        const error = new Error(
          response.status === 429
            ? "OpenRouter alcanzó el límite de solicitudes del plan gratuito."
            : "OpenRouter no pudo completar la generación editorial (HTTP " + response.status + ")."
        );
        error.code = code;
        throw error;
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        const error = new Error("OpenRouter devolvió una respuesta que no es JSON válido.");
        error.code = "PUBLISHER_INVALID_RESPONSE";
        throw error;
      }

      if (payload && payload.error) {
        const error = new Error("El proveedor de modelos rechazó la solicitud de publicación.");
        error.code = "AI_PROVIDERS_UNAVAILABLE";
        throw error;
      }

      const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
      const raw = choice && choice.message && typeof choice.message.content === "string"
        ? choice.message.content
        : "";
      if (!raw.trim()) {
        const error = new Error("El modelo del publicador devolvió una respuesta vacía.");
        error.code = "PUBLISHER_EMPTY_OUTPUT";
        throw error;
      }

      const parsed = parseResearchOutput(raw, sources.length);
      return {
        status: "completed",
        provider: "openrouter",
        model: typeof payload.model === "string" ? payload.model : model,
        internalReport: parsed.internalReport,
        visitorAnswer: parsed.visitorAnswer,
        expandedAnswer: parsed.expandedAnswer,
        claimEvidence: parsed.claimEvidence,
        claimEvidenceMethod: "model_self_assessment",
        sources,
        sourceCount: sources.length,
        usage: payload.usage || null,
        finishReason: choice.finish_reason || null
      };
    }
  };
}

module.exports = {
  OPENROUTER_CHAT_URL,
  DEFAULT_MODEL,
  createOpenRouterPublisher
};
