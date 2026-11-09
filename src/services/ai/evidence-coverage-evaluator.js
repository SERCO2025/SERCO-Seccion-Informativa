"use strict";

// Evaluación léxica inicial y conservadora. No sustituye la validación editorial
// ni demuestra por sí sola que un fragmento responda semánticamente la pregunta.
const STOP_WORDS = new Set([
  "que", "cual", "cuales", "como", "cuando", "donde", "quien", "quienes",
  "para", "por", "con", "sin", "sobre", "entre", "desde", "hasta",
  "una", "uno", "unos", "unas", "los", "las", "del", "de", "el", "la",
  "y", "o", "u", "es", "son", "ser", "esta", "estan", "este", "esa",
  "ese", "hay", "se", "mi", "su", "sus", "me", "puede", "pueden"
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

function tokensMatch(queryToken, evidenceToken) {
  if (queryToken === evidenceToken) return true;
  const sharedLength = Math.min(queryToken.length, evidenceToken.length);
  return sharedLength >= 7 &&
    (queryToken.startsWith(evidenceToken) || evidenceToken.startsWith(queryToken));
}

function createEvidenceCoverageEvaluator() {
  return {
    async evaluate(input) {
      if (!input || typeof input.question !== "string" || !Array.isArray(input.evidence)) {
        throw new TypeError("El evaluador requiere una pregunta y una lista de evidencias.");
      }

      const queryTokens = [...new Set(tokenize(input.question))];
      const evidenceTokens = new Set(
        input.evidence.flatMap((item) => tokenize([
          item && item.title,
          item && item.section,
          item && item.content
        ].filter(Boolean).join(" ")))
      );

      if (queryTokens.length === 0 || evidenceTokens.size === 0) {
        return {
          status: "insufficient",
          matchedTerms: [],
          missingInformation: ["La consulta o la evidencia no contiene términos técnicos suficientes para comprobar su correspondencia."]
        };
      }

      const matchedTerms = queryTokens.filter((queryToken) =>
        [...evidenceTokens].some((evidenceToken) => tokensMatch(queryToken, evidenceToken))
      );
      const missingTerms = queryTokens.filter((queryToken) => !matchedTerms.includes(queryToken));
      const ratio = matchedTerms.length / queryTokens.length;

      let status = "insufficient";
      if (missingTerms.length === 0 && matchedTerms.length >= 1) {
        status = "sufficient";
      } else if (ratio >= 0.25) {
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
