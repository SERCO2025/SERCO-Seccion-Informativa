"use strict";

const { createTavilySearchProvider } = require("../src/services/research/tavily-search-provider");
const { createSequentialResearchProvider } = require("../src/services/research/sequential-research-provider");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");
const { createArticlePersistence } = require("../src/services/editor/article-persistence");
const { createPublicRateLimiter } = require("../src/services/security/public-api-rate-limiter");
const { getCitationOrder } = require("../src/services/research/citation-order");

const tavilySearchProvider = createTavilySearchProvider();
const provider = createSequentialResearchProvider({ searchProvider: tavilySearchProvider });
const persistence = createArticlePersistence();

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function reportToHtml(report) {
  const lines = String(report || "").split(/\r?\n/);
  const output = [];
  let list = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (list) { output.push("</ul>"); list = false; } continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (heading) { if (list) { output.push("</ul>"); list = false; } const level = Math.min(4, heading[1].length + 1); output.push("<h" + level + ">" + escapeHtml(heading[2]) + "</h" + level + ">"); }
    else if (bullet) { if (!list) { output.push("<ul>"); list = true; } output.push("<li>" + escapeHtml(bullet[1]) + "</li>"); }
    else { if (list) { output.push("</ul>"); list = false; } output.push("<p>" + escapeHtml(line) + "</p>"); }
  }
  if (list) output.push("</ul>");
  return output.join("\n");
}

function summaryFromReport(report, query) {
  const plain = String(report || "").replace(/[#*\x60_>]/g, " ").replace(/\s+/g, " ").trim();
  const summary = plain.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 650);
  return summary.length >= 30 ? summary : ("Investigación documental sobre " + query + ". " + plain).slice(0, 650);
}

function buildPartialResearchReport(result) {
  const lines = [
    "# Expediente parcial de investigación",
    "",
    "Consulta: " + result.query,
    "",
    "Estado: Tavily recuperó fuentes, pero ninguno de los proveedores de síntesis completó una explicación validada.",
    "Este expediente conserva la evidencia disponible y los intentos técnicos. No constituye una respuesta elaborada ni una publicación aprobada.",
    "",
    "## Fuentes recuperadas"
  ];
  for (const source of result.sources || []) {
    lines.push(
      "",
      "### [" + source.id + "] " + source.title,
      "URL: " + source.url,
      "Extracto: " + (source.excerpt || "No disponible"),
      source.extractedContent ? "Contenido extraído: " + source.extractedContent : "Contenido completo: no disponible."
    );
  }
  lines.push("", "## Intentos de síntesis");
  for (const attempt of result.providerAttempts || []) {
    lines.push("- " + attempt.provider + " (" + (attempt.model || "modelo no especificado") + "): " +
      (attempt.code || "PROVIDER_ERROR") + (attempt.subcode ? " / " + attempt.subcode : ""));
  }
  return lines.join("\n");
}

function buildCompletedPublicHtml(result) {
  return [
    "<h2>Respuesta inicial</h2>",
    reportToHtml(result.visitorAnswer),
    "<h2>Explicación ampliada</h2>",
    reportToHtml(result.expandedAnswer)
  ].join("\n");
}

function mapResearchSources(sources) {
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => source && source.url && source.title)
    .map((source, index) => ({
      title: source.title,
      source_type: "website",
      source_url: source.url,
      published_date: /^\d{4}-\d{2}-\d{2}$/.test(String(source.publishedDate || "")) ? source.publishedDate : null,
      metadata: {
        citation_order: getCitationOrder(source, index),
        score: typeof source.score === "number" ? source.score : null,
        excerpt: source.excerpt || "",
        extracted_content: source.extractedContent || "",
        evidence_origin: source.evidenceOrigin || "tavily_search_excerpt"
      }
    }));
}

function createPersistingResearchProvider(researchProvider, articlePersistence, options = {}) {
  if (!researchProvider || typeof researchProvider.research !== "function") {
    throw new TypeError("Se requiere un proveedor de investigación.");
  }
  if (!articlePersistence || typeof articlePersistence.save !== "function") {
    throw new TypeError("Se requiere un servicio de persistencia editorial.");
  }
  const now = typeof options.now === "function" ? options.now : () => new Date();

  return {
    async research(input) {
      const result = await researchProvider.research(input);
      const sources = mapResearchSources(result.sources);
      const completed = result.status === "completed";
      const internalReport = completed
        ? String(result.internalReport || "")
        : buildPartialResearchReport(result);

      console.info("[research:persistence] report_ready", {
        sourceCount: sources.length,
        status: completed ? "completed" : "sources_only"
      });

      try {
        if (!sources.length) throw new Error("La investigación no devolvió fuentes bibliográficas registrables.");

        const publicContent = completed
          ? buildCompletedPublicHtml(result)
          : reportToHtml([
            "# Expediente pendiente de elaboración editorial",
            "",
            "La búsqueda externa recuperó fuentes, pero la síntesis de IA no pudo completarse.",
            "El expediente y los extractos se conservaron en el registro privado de investigación.",
            "Esta ficha no es una explicación validada y no está habilitada para recuperación por el asistente."
          ].join("\n"));
        const summarySource = completed
          ? result.visitorAnswer
          : "Expediente parcial de investigación externa sobre " + result.query +
            ". Las fuentes se conservaron para revisión editorial; la síntesis de IA no pudo completarse.";
        const researchDate = now().toISOString();

        console.info("[research:persistence] save_started", {
          sourceCount: sources.length,
          researchStatus: completed ? "completed" : "sources_only"
        });

        const saved = await articlePersistence.save({
          document: {
            title: ("Investigación: " + result.query).slice(0, 240),
            summary: summaryFromReport(summarySource, result.query),
            content_type: "research",
            content_html: publicContent,
            status: "review",
            author_name: "SERCO · Investigación asistida por IA",
            origin: "ai_research",
            specialty: "Investigación e innovación",
            categories: ["Investigación e innovación", "Investigación técnica"],
            tags: ["Investigación IA", "Fuentes externas", ...String(result.query).split(/\s+/).filter((word) => word.length > 3).slice(0, 8)],
            sources,
            assets: [],
            relations: [],
            featured: false,
            ai_retrieval_enabled: completed,
            ...(completed ? {
              visitorAnswer: result.visitorAnswer,
              expandedAnswer: result.expandedAnswer
            } : {}),
            search_metadata: {
              title: result.query,
              description: summaryFromReport(summarySource, result.query),
              query: result.query,
              research_status: completed ? "completed" : "sources_only"
            },
            editorial_metadata: {
              provider: result.provider || "tavily",
              model: result.model || null,
              research_date: researchDate,
              external_research: true,
              research_status: completed ? "completed" : "sources_only",
              synthesis_completed: completed,
              source_count: sources.length
            },
            _research_private: {
              research_status: completed ? "completed" : "sources_only",
              internal_report: internalReport,
              visitor_answer: String(result.visitorAnswer || ""),
              expanded_answer: String(result.expandedAnswer || ""),
              claim_evidence: Array.isArray(result.claimEvidence) ? result.claimEvidence : [],
              sources_snapshot: (Array.isArray(result.sources) ? result.sources : []).map((source) => ({
                id: source.id,
                title: source.title,
                url: source.url,
                published_date: source.publishedDate || null,
                score: source.score,
                excerpt: source.excerpt || "",
                extracted_content: source.extractedContent || "",
                evidence_text: source.evidenceText || source.excerpt || "",
                evidence_origin: source.evidenceOrigin || "tavily_search_excerpt"
              })),
              provider_attempts: Array.isArray(result.providerAttempts) ? result.providerAttempts : [],
              research_metadata: {
                query: result.query,
                provider: result.provider || "tavily",
                answer_provider: result.answerProvider || null,
                model: result.model || null,
                search_provider: result.searchProvider || "tavily",
                search_request_id: result.searchRequestId || null,
                search_queries: Array.isArray(result.searchQueries) ? result.searchQueries : [],
                search_usage: result.searchUsage || null,
                claim_evidence_method: result.claimEvidenceMethod || null,
                researched_at: researchDate
              }
            }
          }
        });

        console.info("[research:persistence] save_completed", {
          indexedChunks: saved.chunk_count,
          researchStatus: completed ? "completed" : "sources_only"
        });

        return {
          ...result,
          persistence: completed ? "saved_for_review" : "saved_partial_for_review",
          publication: {
            id: saved.saved.article_id,
            publicId: saved.saved.public_id,
            version: saved.saved.version_number
          },
          indexedChunks: saved.chunk_count
        };
      } catch (error) {
        console.error("[research:persistence] save_failed", {
          name: error && error.name,
          code: error && error.code
        });
        return {
          ...result,
          persistence: "failed",
          persistenceMessage: "La investigación se recuperó, pero no pudo registrarse en el expediente editorial."
        };
      }
    }
  };
}

const persistingProvider = createPersistingResearchProvider(provider, persistence);
const rateLimiter = createPublicRateLimiter();
const handler = createResearchHttpHandler(persistingProvider, {
  // La consulta ya fue validada por el handler antes de reservar cuota.
  beforeResearch: (req) => rateLimiter.reserve(req, "research"),
  // Una investigación recuperada conserva su cuota aunque su síntesis quede pendiente.
  onResearchSuccess: (reservation) => rateLimiter.complete(reservation.reservationId),
  // Una investigación fallida antes de obtener un resultado devuelve la reserva.
  onResearchFailure: (reservation) => rateLimiter.release(reservation.reservationId)
});

module.exports = async function publicResearchApi(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return handler(req, res);
};

module.exports.createPersistingResearchProvider = createPersistingResearchProvider;
module.exports.buildPartialResearchReport = buildPartialResearchReport;
module.exports.buildCompletedPublicHtml = buildCompletedPublicHtml;
