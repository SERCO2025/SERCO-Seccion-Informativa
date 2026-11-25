"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPersistingResearchProvider,
  buildPartialResearchReport,
  buildCompletedPublicHtml
} = require("../api/research-public");

function source(overrides = {}) {
  return {
    id: 1,
    title: "Manual técnico de estructuras",
    url: "https://example.org/estructuras",
    publishedDate: "2026-11-01",
    score: 0.92,
    excerpt: "Extracto que describe el elemento estructural y su función.",
    extractedContent: "Contenido extraído que amplía la descripción técnica.",
    evidenceText: "Contenido extraído que amplía la descripción técnica.",
    evidenceOrigin: "tavily_extract",
    ...overrides
  };
}

function completedResult() {
  return {
    status: "completed",
    provider: "tavily+gemini",
    answerProvider: "gemini",
    model: "gemini-test",
    query: "¿Qué es una trabe?",
    internalReport: "INFORME INTERNO CONFIDENCIAL: análisis completo de fuentes [1].",
    visitorAnswer: "Una trabe es un elemento estructural que transmite cargas hacia sus apoyos [1].",
    expandedAnswer: "En una estructura, la trabe recibe cargas y las conduce hacia columnas u otros apoyos [1].",
    claimEvidence: [
      { section: "internalReport", claim: "análisis completo de fuentes [1].", assessment: "supported", sourceIds: [1] },
      { section: "visitorAnswer", claim: "Una trabe es un elemento estructural que transmite cargas hacia sus apoyos [1].", assessment: "supported", sourceIds: [1] },
      { section: "expandedAnswer", claim: "En una estructura, la trabe recibe cargas y las conduce hacia columnas u otros apoyos [1].", assessment: "supported", sourceIds: [1] }
    ],
    claimEvidenceMethod: "model_self_assessment_not_independent_verification",
    sources: [source()],
    providerAttempts: [{ provider: "gemini", model: "gemini-test", code: "PROVIDER_COMPLETED" }],
    searchRequestId: "tavily-request-1",
    searchQueries: ["trabe estructura"],
    searchUsage: { credits: 1 }
  };
}

test("guarda las tres piezas, las evidencias y las fuentes de una síntesis completa", async () => {
  let document;
  const provider = createPersistingResearchProvider(
    { async research() { return completedResult(); } },
    { async save(input) {
      document = input.document;
      return { saved: { article_id: "article-1", public_id: "public-1", version_number: 1 }, chunk_count: 2 };
    } },
    { now: () => new Date("2026-11-25T12:00:00.000Z") }
  );

  const result = await provider.research({ query: "¿Qué es una trabe?" });

  assert.equal(result.persistence, "saved_for_review");
  assert.equal(document.status, "review");
  assert.equal(document.ai_retrieval_enabled, true);
  assert.equal(document.visitorAnswer, completedResult().visitorAnswer);
  assert.equal(document.expandedAnswer, completedResult().expandedAnswer);
  assert.match(document.content_html, /Respuesta inicial/);
  assert.match(document.content_html, /Explicación ampliada/);
  assert.equal(document.content_html.includes("INFORME INTERNO CONFIDENCIAL"), false);
  assert.equal(document._research_private.internal_report, completedResult().internalReport);
  assert.match(document._research_private.internal_report_html, /INFORME INTERNO CONFIDENCIAL/);
  assert.equal(document._research_private.claim_evidence.length, 3);
  assert.equal(document._research_private.sources_snapshot[0].evidence_origin, "tavily_extract");
  assert.equal(document.sources[0].metadata.extracted_content, "Contenido extraído que amplía la descripción técnica.");
  assert.equal(document.editorial_metadata.synthesis_completed, true);
  assert.equal(Object.hasOwn(document.editorial_metadata, "claim_evidence_index"), false);
});

test("conserva las fuentes y los intentos cuando todos los proveedores de síntesis fallan", async () => {
  let document;
  const partial = {
    status: "sources_only",
    provider: "tavily",
    query: "¿Qué es una trabe?",
    visitorAnswer: "Tavily encontró fuentes, pero no se pudo elaborar una síntesis.",
    expandedAnswer: "Los resultados externos no constituyen una respuesta validada.",
    sources: [source()],
    providerAttempts: [
      { provider: "gemini", model: "gemini-test", code: "PROVIDER_RATE_LIMITED" },
      { provider: "groq", model: "groq-test", code: "PROVIDER_TIMEOUT" },
      { provider: "cloudflare-workers-ai", model: "cf-test", code: "PROVIDER_UPSTREAM_ERROR" }
    ],
    fallbackReason: "all_ai_providers_unavailable"
  };
  const provider = createPersistingResearchProvider(
    { async research() { return partial; } },
    { async save(input) {
      document = input.document;
      return { saved: { article_id: "article-2", public_id: "public-2", version_number: 1 }, chunk_count: 1 };
    } }
  );

  const result = await provider.research({ query: partial.query });

  assert.equal(result.persistence, "saved_partial_for_review");
  assert.equal(document.status, "review");
  assert.equal(document.ai_retrieval_enabled, false);
  assert.equal(Object.hasOwn(document, "visitorAnswer"), false);
  assert.equal(Object.hasOwn(document, "expandedAnswer"), false);
  assert.equal(document._research_private.research_status, "sources_only");
  assert.match(document._research_private.internal_report, /Expediente parcial de investigación/);
  assert.match(document._research_private.internal_report, /Manual técnico de estructuras/);
  assert.equal(document._research_private.provider_attempts.length, 3);
  assert.equal(document.sources.length, 1);
  assert.match(document.content_html, /no pudo completarse/);
});

test("no presenta una síntesis como guardada cuando falla la persistencia", async () => {
  const provider = createPersistingResearchProvider(
    { async research() { return completedResult(); } },
    { async save() { throw Object.assign(new Error("private database detail"), { code: "PERSISTENCE_FAILED" }); } }
  );

  const result = await provider.research({ query: "¿Qué es una trabe?" });
  assert.equal(result.persistence, "failed");
  assert.equal(result.persistenceMessage.includes("private database detail"), false);
});

test("el expediente parcial incluye extractos y códigos de fallo sin detalles privados", () => {
  const report = buildPartialResearchReport({
    query: "Consulta técnica",
    sources: [source()],
    providerAttempts: [{ provider: "gemini", code: "PROVIDER_TIMEOUT", subcode: "REQUEST_TIMEOUT" }]
  });
  assert.match(report, /Extracto: Extracto que describe/);
  assert.match(report, /PROVIDER_TIMEOUT \/ REQUEST_TIMEOUT/);
  assert.equal(report.includes("API_KEY"), false);
});

test("la página editorial de una síntesis completa separa respuesta inicial y ampliada", () => {
  const html = buildCompletedPublicHtml(completedResult());
  assert.match(html, /Respuesta inicial/);
  assert.match(html, /Explicación ampliada/);
  assert.equal(html.includes("INFORME INTERNO CONFIDENCIAL"), false);
});
