"use strict";

// Evaluación léxica inicial y conservadora. No sustituye la validación editorial
// ni demuestra por sí sola que un fragmento responda semánticamente la pregunta.
const STOP_WORDS = new Set([
  "que", "cual", "cuales", "como", "cuando", "donde", "quien", "quienes",
  "para", "por", "con", "sin", "sobre", "entre", "desde", "hasta",
  "una", "uno", "unos", "unas", "los", "las", "del", "de", "el", "la",
  "y", "o", "u", "es", "son", "ser", "esta", "estan", "este", "esa",
  "ese", "hay", "se", "mi", "su", "sus", "me", "puede", "pueden", "sirve", "sirven", "servir", "sirviendo", "sirvio"
]);

function normalizeToken(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokenize(value) {
  return String(value || "")
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function singularizeToken(token) {
  if (token.length > 5 && token.endsWith("ciones")) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokensMatch(queryToken, evidenceToken) {
  return singularizeToken(queryToken) === singularizeToken(evidenceToken);
}

function createEvidenceCoverageEvaluator() {
  return {
    async evaluate(input) {
      if (!input || typeof input.question !== "string" || !Array.isArray(input.evidence)) {
        throw new TypeError("El evaluador requiere una pregunta y una lista de evidencias.");
      }

      const queryTokens = [...new Set(tokenize(input.question))];
      const evidenceGroups = new Map();

      input.evidence.forEach((item, index) => {
        const articleId = item && typeof item.articleId === "string" ? item.articleId.trim() : "";
        const evidenceId = item && typeof item.id === "string" ? item.id : String(index);
        const groupId = articleId ? "article:" + articleId : "evidence:" + evidenceId;
        const tokens = tokenize([
          item && item.title,
          item && item.section,
          item && item.content
        ].filter(Boolean).join(" "));

        if (!evidenceGroups.has(groupId)) {
          evidenceGroups.set(groupId, new Set());
        }

        for (const token of tokens) {
          evidenceGroups.get(groupId).add(token);
        }
      });

      if (queryTokens.length === 0 || evidenceGroups.size === 0) {
        return {
          status: "insufficient",
          matchedTerms: [],
          missingInformation: ["La consulta o la evidencia no contiene términos técnicos suficientes para comprobar su correspondencia."]
        };
      }

      let bestCoverage = null;
      for (const evidenceTokens of evidenceGroups.values()) {
        if (evidenceTokens.size === 0) continue;

        const matchedTerms = queryTokens.filter((queryToken) =>
          [...evidenceTokens].some((evidenceToken) => tokensMatch(queryToken, evidenceToken))
        );
        const ratio = matchedTerms.length / queryTokens.length;

        if (
          !bestCoverage ||
          ratio > bestCoverage.ratio ||
          (ratio === bestCoverage.ratio && matchedTerms.length > bestCoverage.matchedTerms.length)
        ) {
          bestCoverage = { matchedTerms, ratio };
        }
      }

      if (!bestCoverage) {
        return {
          status: "insufficient",
          matchedTerms: [],
          missingInformation: ["La evidencia recuperada no contiene términos útiles para comprobar su correspondencia."]
        };
      }

      const matchedTerms = bestCoverage.matchedTerms;
      const missingTerms = queryTokens.filter((queryToken) => !matchedTerms.includes(queryToken));
      const ratio = bestCoverage.ratio;

      let status = "insufficient";
      if (missingTerms.length === 0 && matchedTerms.length >= 1) {
        status = "sufficient";
      } else if (matchedTerms.length >= 2 && ratio >= 0.5) {
        status = "partial";
      }

      return {
        status,
        matchedTerms,
        missingInformation: missingTerms.length
          ? ["No se encontró respaldo documental para estos términos de la consulta: " + missingTerms.join(", ") + "."]
          : []
      };
    }
  };
}

module.exports = {
  createEvidenceCoverageEvaluator,
  tokenize,
  tokensMatch
};
