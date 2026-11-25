"use strict";

const { createTavilySearchProvider } = require("../src/services/research/tavily-search-provider");
const { createOpenRouterPublisher } = require("../src/services/publisher/openrouter-publisher-provider");
const { createArticlePersistence } = require("../src/services/editor/article-persistence");
const { getCitationOrder } = require("../src/services/research/citation-order");
const { createConstructionResearchDiscovery } = require("../src/services/publisher/construction-research-discovery");
const { validateEditorialArticle } = require("../src/services/publisher/editorial-quality-gate");
const { normalizePublishedDate, createArticleSlug } = require("../src/services/publisher/document-metadata");
const { discoverPublisherMediaCandidates } = require("../src/services/publisher/media-candidate-discovery");

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_TOKEN = process.env.SERCO_AUTO_PUBLISH_TOKEN || "";
const PUBLISHER_API_KEY = process.env.OPENROUTER_PUBLISHER_API_KEY || "";
const HAS_PUBLISHER_PROVIDER = Boolean(PUBLISHER_API_KEY);
const SEARCH = createTavilySearchProvider({ maxResults: 8, extractEnabled: true });
const DISCOVERY = createConstructionResearchDiscovery(SEARCH, { maxCandidates: 4, minDocumentLength: 500 });
const RESEARCH = createOpenRouterPublisher({
  searchProvider: SEARCH,
  apiKey: PUBLISHER_API_KEY,
  model: process.env.OPENROUTER_PUBLISHER_MODEL || undefined,
  timeoutMs: 45000
});
const PERSISTENCE = createArticlePersistence();

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}
function reportToHtml(report) {
  const lines = String(report || "").split(/\r?\n/);
  const out = [];
  let list = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (list) { out.push("</ul>"); list = false; } continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (heading) { if (list) { out.push("</ul>"); list = false; } const level = Math.min(4, heading[1].length + 1); out.push("<h" + level + ">" + escapeHtml(heading[2]) + "</h" + level + ">"); }
    else if (bullet) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + escapeHtml(bullet[1]) + "</li>"); }
    else { if (list) { out.push("</ul>"); list = false; } out.push("<p>" + escapeHtml(line) + "</p>"); }
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}
function plainText(report) {
  return String(report || "").replace(/[#*_`>]/g, " ").replace(/\s+/g, " ").trim();
}
function summary(report) {
  return plainText(report).split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 650);
}
async function supabaseRest(path) {
  const headers = { apikey: SECRET_KEY };
  if (!SECRET_KEY.startsWith("sb_secret_")) headers.Authorization = "Bearer " + SECRET_KEY;
  const response = await fetch(BASE + path, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("CATALOG_HTTP_" + response.status + ": " + String(payload && (payload.message || payload.details || payload.hint || payload.code) || "Respuesta no disponible"));
  return payload;
}
async function generate(discovery, index, batchId) {
  const topic = discovery.topic;
  const query = [
    "Redacta una entrada técnica de SERCO basada exclusivamente en los documentos originales entregados.",
    "Tema documental identificado: " + topic,
    "Línea de investigación: " + discovery.focus,
    "Especialidad: " + discovery.specialty,
    "Desarrolla únicamente lo que esté respaldado por los documentos: fundamentos, especificaciones, metodología, resultados, aplicaciones reales en obras, control de calidad, seguridad, normativa y limitaciones pertinentes.",
    "No conviertas el título de una fuente en un tema genérico. No agregues información ajena al contenido documental ni inventes datos, autores, ensayos, normas o resultados.",
    "Contrasta los documentos entre sí, distingue datos medidos de recomendaciones comerciales y señala discrepancias, jurisdicción y vigencia cuando estén documentadas.",
    "Evalúa fuentes privadas, fabricantes, constructoras, despachos y laboratorios por el contenido técnico, autoría, metodología y evidencia; no por el tipo de dominio."
  ].join(" ");
  const result = await RESEARCH.research({ query, sources: discovery.sources });
  if (result.status !== "completed" || !result.expandedAnswer || !result.internalReport) {
    const unavailable = new Error("El proveedor independiente no pudo completar la redacción del documento técnico.");
    unavailable.code = "AI_PROVIDERS_UNAVAILABLE";
    throw unavailable;
  }
  const sources = (result.sources || []).filter((s) => s && s.title && s.rawContent && s.rawContent.length >= 500).slice(0, 8).map((s, sourceIndex) => ({
    title: s.title, source_type: "technical_document", source_url: s.url,
    published_date: normalizePublishedDate(s.publishedDate),
    metadata: {
      provider: "Tavily",
      score: s.score || null,
      citation_order: getCitationOrder(s, sourceIndex),
      full_document_reviewed: true,
      relevance: s.relevance || null
    }
  }));
  if (sources.length < 2) throw new Error("La redacción no conservó dos documentos técnicos originales previamente evaluados.");
  const body = String(result.expandedAnswer || "").trim();
  const internalReport = String(result.internalReport || "").trim();
  if (body.length < 1200) throw new Error("La explicación pública no alcanzó la extensión mínima de calidad.");
  if (internalReport.length < 1200) throw new Error("El expediente interno no alcanzó la extensión mínima de calidad.");
  const editorialQuality = validateEditorialArticle({
    topic,
    body,
    internalReport,
    sources: result.sources,
    claimEvidence: result.claimEvidence
  });
  const title = "Diccionario técnico: " + topic;
  const summaryText = summary(body);
  if (summaryText.length < 30) throw new Error("No se pudo generar un resumen suficiente para el documento técnico.");
  const slugBase = createArticleSlug(topic);
  const mediaCandidates = discoverPublisherMediaCandidates(discovery.sources, { topic, focus: discovery.focus, query: discovery.query });
  const document = {
    title, slug: "diccionario-" + slugBase,
    summary: summaryText, content_type: "dictionary_entry", status: "review",
    author_name: "SERCO · Diccionario técnico automatizado", origin: "ai_research",
    specialty: discovery.specialty,
    categories: ["Diccionario técnico", discovery.category, discovery.specialty],
    tags: ["diccionario", "documentación técnica", "SERCO", discovery.category.toLowerCase()],
    content_html: reportToHtml(body), content_text: body, sources, assets: [], relations: [],
    featured: false, ai_retrieval_enabled: false,
    search_metadata: { title, description: summaryText, concepts: [topic, discovery.category, discovery.specialty] },
    editorial_metadata: {
      provider: result.provider, model: result.model, research_date: new Date().toISOString(),
      external_research: true, automated_dictionary: true, automation_batch: batchId,
      sequence_in_batch: index + 1, source_count: sources.length,
      media_candidate_count: mediaCandidates.length,
      discovery_method: "source_first_full_document_review",
      discovery_category: discovery.category,
      editorial_note: "Documento redactado a partir de documentos técnicos originales extraídos y filtrados por pertinencia directa con construcción física, ingeniería civil, arquitectura u obra."
    },
    visitorAnswer: String(result.visitorAnswer || ""),
    expandedAnswer: body,
    _research_private: {
      research_status: "completed",
      internal_report: internalReport,
      internal_report_html: reportToHtml(internalReport),
      visitor_answer: String(result.visitorAnswer || ""),
      expanded_answer: body,
      claim_evidence: Array.isArray(result.claimEvidence) ? result.claimEvidence : [],
      sources_snapshot: (Array.isArray(result.sources) ? result.sources : []).map((source, sourceIndex) => ({
        id: source.id || sourceIndex + 1,
        title: source.title || "",
        url: source.url || "",
        published_date: source.publishedDate || null,
        score: source.score ?? null,
        excerpt: source.content || source.excerpt || "",
        extracted_content: source.rawContent || "",
        evidence_text: source.rawContent || source.content || "",
        evidence_origin: source.rawContent ? "tavily_extract" : "tavily_search_excerpt"
      })),
      provider_attempts: Array.isArray(result.providerAttempts) ? result.providerAttempts : [],
      research_metadata: {
        query,
        provider: result.provider || "tavily",
        answer_provider: result.answerProvider || null,
        model: result.model || null,
        search_request_id: result.searchRequestId || null,
        claim_evidence_method: result.claimEvidenceMethod || null,
        editorial_quality_gate: editorialQuality,
        media_candidates: mediaCandidates,
        researched_at: new Date().toISOString()
      }
    }
  };
  const saved = await PERSISTENCE.save({ document });
  return { title, public_id: saved.saved.public_id, article_id: saved.saved.article_id, sources: sources.length, chunks: saved.chunk_count };
}
module.exports = async function automaticEditorialPublisher(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "METHOD_NOT_ALLOWED" }); }
  if (!BASE || !SECRET_KEY || !HAS_PUBLISHER_PROVIDER || !process.env.TAVILY_API_KEY || !CRON_TOKEN) {
    return send(res, 503, { error: "AUTO_PUBLISH_NOT_CONFIGURED" });
  }
  const auth = String(req.headers && req.headers.authorization || "");
  if (auth !== "Bearer " + CRON_TOKEN) return send(res, 401, { error: "UNAUTHORIZED" });
  try {
    const existingArticles = await supabaseRest("/rest/v1/articles?select=id,title,created_at&origin=eq.ai_research&content_type=eq.dictionary_entry&order=created_at.desc&limit=1000");
    const existingArticleIds = (existingArticles || [])
      .map((article) => String(article && article.id || ""))
      .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
    const existingSourceUrls = new Set();
    if (existingArticleIds.length) {
      const articleIdFilter = existingArticleIds.join(",");
      const existingSources = await supabaseRest(
        "/rest/v1/article_sources?select=source_url&article_id=in.(" + articleIdFilter + ")&limit=10000"
      );
      for (const source of (existingSources || [])) {
        if (source && typeof source.source_url === "string") {
          existingSourceUrls.add(source.source_url.split("#")[0].replace(/\/$/, "").toLowerCase());
        }
      }
    }
    const existingTopics = (existingArticles || []).map((article) => String(article && article.title || ""));
    const discovery = await DISCOVERY.discover({ now: new Date(), existingSourceUrls, existingTopics });
    console.info("[publisher:discovery] completed", {
      status: discovery.status,
      category: discovery.plan,
      searchResultCount: discovery.searchResultCount || 0,
      candidateCount: discovery.candidateCount || 0,
      extractedCount: discovery.extractedCount || 0,
      acceptedCount: discovery.acceptedCount || 0
    });
    if (discovery.status !== "ready") {
      return send(res, 200, {
        success: true,
        generated: 0,
        reason: "NO_RELEVANT_CONSTRUCTION_DOCUMENTS",
        search_category: discovery.plan,
        search_results_returned: discovery.searchResultCount || 0,
        candidates_reviewed: discovery.candidateCount || 0,
        documents_extracted: discovery.extractedCount || 0,
        documents_accepted: discovery.acceptedCount || 0
      });
    }
    const batchId = new Date().toISOString().replace(/[:.]/g, "-");
    const results = [await generate(discovery, 0, batchId)];
    return send(res, 200, { success: true, generated: results.length, batch_id: batchId, publications: results });
  } catch (error) {
    const unavailable = error && error.code === "AI_PROVIDERS_UNAVAILABLE";
    return send(res, unavailable ? 503 : 502, {
      error: unavailable ? "AI_PROVIDERS_UNAVAILABLE" : "AUTO_PUBLISH_FAILED",
      message: String(error && error.message || "Error desconocido")
    });
  }
};
module.exports.config = { maxDuration: 60 };
module.exports.createConstructionResearchDiscovery = createConstructionResearchDiscovery;
