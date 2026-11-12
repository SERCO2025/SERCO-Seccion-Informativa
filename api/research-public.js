"use strict";

const { createTavilySearchProvider } = require("../src/services/research/tavily-search-provider");
const { createGeminiResearchProvider } = require("../src/services/research/gemini-research-provider");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");
const { createArticlePersistence } = require("../src/services/editor/article-persistence");
const {
  createPublicRateLimiter,
  PublicRateLimitConfigurationError
} = require("../src/services/security/public-api-rate-limiter");

const tavilySearchProvider = createTavilySearchProvider();
const provider = createGeminiResearchProvider({ searchProvider: tavilySearchProvider });
const persistence = createArticlePersistence();

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"' : "&quot;" }[char]));
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
  const plain = String(report || "").replace(/[#*`_>]/g, " ").replace(/\s+/g, " ").trim();
  const summary = plain.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 650);
  return summary.length >= 30 ? summary : ("Investigación documental sobre " + query + ". " + plain).slice(0, 650);
}
const persistingProvider = {
  async research(input) {
    const result = await provider.research(input);
    try {
      const sources = (result.sources || []).filter((source) => source && source.url && source.title).map((source) => ({
        title: source.title,
        source_type: "website",
        source_url: source.url,
        published_date: /^\d{4}-\d{2}-\d{2}$/.test(String(source.publishedDate || "")) ? source.publishedDate : null
      }));
      if (!sources.length) throw new Error("La investigación no devolvió fuentes bibliográficas registrables.");
      const saved = await persistence.save({
        document: {
          title: ("Investigación: " + result.query).slice(0, 240),
          summary: summaryFromReport(result.report, result.query),
          content_type: "research",
          content_html: reportToHtml(result.report),
          content_text: result.report,
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
          ai_retrieval_enabled: true,
          search_metadata: { title: result.query, description: summaryFromReport(result.report, result.query), query: result.query },
          editorial_metadata: { provider: result.provider, model: result.model, research_date: new Date().toISOString(), external_research: true }
        }
      });
      return { ...result, persistence: "saved_for_review", publication: { id: saved.saved.article_id, publicId: saved.saved.public_id, version: saved.saved.version_number }, indexedChunks: saved.chunk_count };
    } catch (error) {
      return { ...result, persistence: "failed", persistenceMessage: "La investigación se respondió, pero no pudo registrarse como documento editorial." };
    }
  }
};
const handler = createResearchHttpHandler(persistingProvider);
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
