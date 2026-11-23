"use strict";

const STOP_WORDS = new Set([
  "para", "como", "desde", "hasta", "entre", "sobre", "bajo", "ante", "cada",
  "este", "esta", "estos", "estas", "ese", "esa", "que", "con", "sin", "por",
  "una", "uno", "unos", "unas", "del", "las", "los", "les", "sus", "son",
  "ser", "fue", "han", "hay", "puede", "pueden", "debe", "deben", "tambien",
  "cuando", "donde", "cual", "cuales", "mas", "muy", "asi", "al", "el", "la",
  "un", "y", "o", "e", "u", "en", "a", "de", "se", "su", "no", "es"
]);

class EditorialQualityError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "EditorialQualityError";
    this.code = code;
    this.details = details;
  }
}

function words(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().match(/[a-z0-9]+/g) || [];
}

function meaningfulWords(value) {
  return [...new Set(words(value).filter((word) => word.length >= 4 && !STOP_WORDS.has(word)))];
}

function citedIds(value) {
  return [...new Set([...String(value || "").matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))];
}

function sourceHost(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function sentenceList(value) {
  return String(value || "").split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
}

function validateEditorialArticle({ topic, body, internalReport, sources, claimEvidence }) {
  const title = String(topic || "").trim();
  const article = String(body || "").trim();
  const report = String(internalReport || "").trim();
  const references = Array.isArray(sources) ? sources : [];
  const evidenceIndex = Array.isArray(claimEvidence) ? claimEvidence : [];

  if (title.length < 3 || article.length < 2500 || report.length < 1200) {
    throw new EditorialQualityError(
      "El artículo o su expediente documental no alcanza la extensión técnica mínima.",
      "EDITORIAL_INSUFFICIENT_DEPTH",
      { articleLength: article.length, reportLength: report.length }
    );
  }

  const headings = article.split(/\r?\n/).filter((line) => /^\s{0,3}#{1,3}\s+\S/.test(line));
  if (headings.length < 4) {
    throw new EditorialQualityError(
      "El artículo no desarrolla suficientes apartados técnicos diferenciados.",
      "EDITORIAL_INSUFFICIENT_STRUCTURE",
      { headingCount: headings.length }
    );
  }

  const articleSentences = sentenceList(article).filter((line) => !/^#{1,6}\s/.test(line));
  if (articleSentences.length < 12) {
    throw new EditorialQualityError(
      "El artículo no contiene desarrollo explicativo suficiente.",
      "EDITORIAL_INSUFFICIENT_DEVELOPMENT",
      { sentenceCount: articleSentences.length }
    );
  }

  const normalizedSentences = articleSentences.map((line) => words(line).join(" "));
  const uniqueSentenceCount = new Set(normalizedSentences).size;
  const duplicateRatio = normalizedSentences.length
    ? 1 - uniqueSentenceCount / normalizedSentences.length
    : 1;
  if (duplicateRatio > 0.12) {
    throw new EditorialQualityError(
      "El artículo contiene repetición excesiva de oraciones.",
      "EDITORIAL_REPETITIVE_CONTENT",
      { duplicateRatio }
    );
  }

  const topicTerms = meaningfulWords(title);
  const articleTerms = new Set(meaningfulWords(article));
  const topicMatches = topicTerms.filter((term) => articleTerms.has(term));
  if (!topicTerms.length || topicMatches.length < Math.min(2, topicTerms.length)) {
    throw new EditorialQualityError(
      "El contenido no demuestra relación textual suficiente con el tema técnico asignado.",
      "EDITORIAL_TOPIC_MISMATCH",
      { topicTerms, matchedTerms: topicMatches }
    );
  }

  if (references.length < 2) {
    throw new EditorialQualityError("Se requieren al menos dos fuentes técnicas.", "EDITORIAL_TOO_FEW_SOURCES");
  }

  const citationIds = citedIds(article);
  if (citationIds.length < 2) {
    throw new EditorialQualityError(
      "El artículo no contrasta al menos dos fuentes mediante citas directas.",
      "EDITORIAL_INSUFFICIENT_CITATION_DIVERSITY",
      { citedSourceIds: citationIds }
    );
  }

  const sourceById = new Map(references.map((source, index) => [index + 1, source]));
  const citedSources = citationIds.map((id) => sourceById.get(id));
  if (citedSources.some((source) => !source)) {
    throw new EditorialQualityError("El artículo cita una fuente inexistente.", "EDITORIAL_INVALID_CITATION");
  }

  const distinctHosts = new Set(citedSources.map((source) => sourceHost(source.url)).filter(Boolean));
  if (distinctHosts.size < 2) {
    throw new EditorialQualityError(
      "Las citas no proceden de al menos dos dominios independientes.",
      "EDITORIAL_INSUFFICIENT_SOURCE_INDEPENDENCE",
      { hostCount: distinctHosts.size }
    );
  }

  for (const id of citationIds) {
    const source = sourceById.get(id);
    const evidence = String(source && (source.evidenceText || source.excerpt || source.content) || "").trim();
    if (evidence.length < 80) {
      throw new EditorialQualityError(
        "Una fuente citada no contiene extracto documental suficiente para contrastar afirmaciones.",
        "EDITORIAL_WEAK_SOURCE_EVIDENCE",
        { sourceId: id, evidenceLength: evidence.length }
      );
    }
  }

  const expandedClaims = evidenceIndex.filter((item) => item && item.section === "expandedAnswer");
  if (!expandedClaims.length) {
    throw new EditorialQualityError(
      "Falta el índice de evidencia correspondiente al artículo público.",
      "EDITORIAL_MISSING_CLAIM_EVIDENCE"
    );
  }

  for (const claim of expandedClaims) {
    if (claim.assessment !== "supported" || !Array.isArray(claim.sourceIds) || !claim.sourceIds.length) {
      throw new EditorialQualityError(
        "El modelo marcó una afirmación del artículo como parcial, incierta o no respaldada.",
        "EDITORIAL_UNSUPPORTED_CLAIM",
        { assessment: claim.assessment }
      );
    }

    const claimTerms = meaningfulWords(String(claim.claim || "").replace(/\[\d+\]/g, ""));
    const claimNumbers = (String(claim.claim || "").replace(/\[\d+\]/g, "").match(/\b\d+(?:[.,]\d+)?\s*(?:%|°c|mpa|gpa|kn|mm|cm|m|kg|t|hz)?\b/gi) || [])
      .map((value) => value.replace(/\s+/g, "").toLowerCase());
    let supportedByEvidence = false;

    for (const id of claim.sourceIds) {
      const source = sourceById.get(id);
      if (!source) continue;
      const evidence = String(source.evidenceText || source.excerpt || source.content || "");
      const evidenceTerms = new Set(meaningfulWords(evidence));
      const sharedTerms = claimTerms.filter((term) => evidenceTerms.has(term));
      const termCoverage = claimTerms.length ? sharedTerms.length / claimTerms.length : 0;
      const evidenceNumbers = (evidence.match(/\b\d+(?:[.,]\d+)?\s*(?:%|°c|mpa|gpa|kn|mm|cm|m|kg|t|hz)?\b/gi) || [])
        .map((value) => value.replace(/\s+/g, "").toLowerCase());
      const numbersMatch = claimNumbers.every((number) => evidenceNumbers.includes(number));
      if (sharedTerms.length >= 2 && termCoverage >= 0.12 && numbersMatch) {
        supportedByEvidence = true;
        break;
      }
    }

    if (!supportedByEvidence) {
      throw new EditorialQualityError(
        "No se encontró coincidencia documental suficiente entre una afirmación y el extracto de sus fuentes citadas.",
        "EDITORIAL_CLAIM_EVIDENCE_MISMATCH",
        { claim: String(claim.claim || "").slice(0, 180), sourceIds: claim.sourceIds }
      );
    }
  }

  return {
    passed: true,
    checks: [
      "technical_topic_relevance",
      "minimum_depth_and_structure",
      "repetition_screen",
      "two_domain_citation_diversity",
      "source_excerpt_presence",
      "claim_to_source_lexical_match"
    ],
    articleLength: article.length,
    headingCount: headings.length,
    citedSourceCount: citationIds.length,
    distinctSourceDomains: distinctHosts.size,
    assessedClaims: expandedClaims.length,
    independentlyVerified: false
  };
}

module.exports = { EditorialQualityError, validateEditorialArticle };
