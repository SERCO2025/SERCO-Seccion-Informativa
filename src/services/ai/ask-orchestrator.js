"use strict";

const ALLOWED_COVERAGE = new Set(["sufficient", "partial", "insufficient"]);
const ALLOWED_SAFETY_DECISIONS = new Set(["allow", "clarify", "block"]);
const MIN_QUESTION_LENGTH = 3;
const MAX_QUESTION_LENGTH = 2000;

class AskInputError extends Error {
  constructor(message, code = "INVALID_QUESTION") {
    super(message);
    this.name = "AskInputError";
    this.code = code;
  }
}

class AskAdapterError extends Error {
  constructor(message, code = "ASK_ADAPTER_ERROR") {
    super(message);
    this.name = "AskAdapterError";
    this.code = code;
  }
}

function validateQuestion(value) {
  if (typeof value !== "string") {
    throw new AskInputError("La pregunta debe ser texto.");
  }

  const question = value.trim();

  if (question.length < MIN_QUESTION_LENGTH) {
    throw new AskInputError("La pregunta es demasiado corta.");
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    throw new AskInputError("La pregunta supera el límite de 2000 caracteres.");
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(question)) {
    throw new AskInputError("La pregunta contiene caracteres no permitidos.");
  }

  return question;
}

function requireMethod(adapter, method, adapterName) {
  if (!adapter || typeof adapter[method] !== "function") {
    throw new AskAdapterError(
      "No está configurado el adaptador requerido: " + adapterName + "." + method + ".",
      "ADAPTER_NOT_CONFIGURED"
    );
  }
}

function validateEvidence(items) {
  if (!Array.isArray(items)) {
    throw new AskAdapterError("El recuperador debe devolver una lista de evidencias.", "INVALID_RETRIEVAL_RESULT");
  }

  const seen = new Set();

  return items.map((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      typeof item.articleId !== "string" ||
      typeof item.slug !== "string" ||
      typeof item.title !== "string" ||
      !Number.isInteger(item.version) ||
      item.version < 1 ||
      typeof item.content !== "string" ||
      !item.content.trim()
    ) {
      throw new AskAdapterError(
        "El recuperador devolvió una evidencia incompleta o inválida.",
        "INVALID_EVIDENCE"
      );
    }

    if (seen.has(item.id)) {
      throw new AskAdapterError("El recuperador devolvió identificadores de evidencia duplicados.", "DUPLICATE_EVIDENCE");
    }

    seen.add(item.id);
    return item;
  });
}

function buildCitations(citationIds, evidence) {
  if (!Array.isArray(citationIds) || citationIds.length === 0) {
    throw new AskAdapterError(
      "La respuesta generada no contiene referencias verificables.",
      "MISSING_CITATIONS"
    );
  }

  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const uniqueIds = [...new Set(citationIds)];

  if (uniqueIds.length !== citationIds.length) {
    throw new AskAdapterError("La respuesta contiene referencias duplicadas.", "DUPLICATE_CITATIONS");
  }

  return uniqueIds.map((id) => {
    const item = evidenceById.get(id);

    if (!item) {
      throw new AskAdapterError(
        "La respuesta cita una evidencia que no fue recuperada.",
        "UNVERIFIED_CITATION"
      );
    }

    return {
      citationId: item.id,
      articleId: item.articleId,
      publicId: typeof item.publicId === "string" ? item.publicId : null,
      slug: item.slug,
      title: item.title,
      version: item.version,
      section: typeof item.section === "string" ? item.section : null,
      excerpt: typeof item.excerpt === "string" ? item.excerpt : item.content.slice(0, 320),
      sources: Array.isArray(item.sources) ? item.sources : []
    };
  });
}

function publicEvidence(evidence) {
  return evidence.map((item) => ({
    id: item.id,
    articleId: item.articleId,
    publicId: typeof item.publicId === "string" ? item.publicId : null,
    slug: item.slug,
    title: item.title,
    version: item.version,
    section: typeof item.section === "string" ? item.section : null,
    content: item.content,
    sources: Array.isArray(item.sources) ? item.sources : []
  }));
}

function createAskOrchestrator(adapters) {
  const configured = adapters || {};

  return {
    async ask(input) {
      const question = validateQuestion(input && input.question);

      requireMethod(configured.retriever, "search", "retriever");
      requireMethod(configured.coverageEvaluator, "evaluate", "coverageEvaluator");
      requireMethod(configured.safetyGuard, "evaluate", "safetyGuard");

      const retrieval = await configured.retriever.search({
        query: question,
        limit: 8,
        publicationStatus: "published"
      });

      const evidence = validateEvidence(retrieval && retrieval.items);

      if (evidence.length === 0) {
        if (configured.gapRecorder && typeof configured.gapRecorder.record === "function") {
          await configured.gapRecorder.record({
            question,
            reason: "no_evidence_retrieved"
          });
        }

        return {
          status: "insufficient",
          coverage: "insufficient",
          answer: "Por el momento, SERCO no cuenta con información publicada suficiente para responder esta pregunta.",
          citations: [],
          missingInformation: ["No se encontraron publicaciones vigentes que respalden una respuesta."],
          gapRecorded: Boolean(configured.gapRecorder && typeof configured.gapRecorder.record === "function")
        };
      }

      const coverageResult = await configured.coverageEvaluator.evaluate({
        question,
        evidence: publicEvidence(evidence)
      });

      if (!coverageResult || !ALLOWED_COVERAGE.has(coverageResult.status)) {
        throw new AskAdapterError(
          "El evaluador devolvió un estado de cobertura no reconocido.",
          "INVALID_COVERAGE_RESULT"
        );
      }

      if (coverageResult.status === "insufficient") {
        if (configured.gapRecorder && typeof configured.gapRecorder.record === "function") {
          await configured.gapRecorder.record({
            question,
            reason: "insufficient_evidence",
            missingInformation: Array.isArray(coverageResult.missingInformation)
              ? coverageResult.missingInformation
              : []
          });
        }

        return {
          status: "insufficient",
          coverage: "insufficient",
          answer: "La información publicada que se encontró no es suficiente para responder con fiabilidad. No voy a completar los datos faltantes mediante suposiciones.",
          citations: [],
          missingInformation: Array.isArray(coverageResult.missingInformation)
            ? coverageResult.missingInformation
            : [],
          gapRecorded: Boolean(configured.gapRecorder && typeof configured.gapRecorder.record === "function")
        };
      }

      const safetyResult = await configured.safetyGuard.evaluate({
        question,
        evidence: publicEvidence(evidence),
        coverage: coverageResult.status
      });

      if (!safetyResult || !ALLOWED_SAFETY_DECISIONS.has(safetyResult.decision)) {
        throw new AskAdapterError(
          "El control de seguridad devolvió una decisión no reconocida.",
          "INVALID_SAFETY_RESULT"
        );
      }

      if (safetyResult.decision === "clarify") {
        return {
          status: "needs_clarification",
          coverage: coverageResult.status,
          answer: typeof safetyResult.message === "string"
            ? safetyResult.message
            : "Necesito algunos datos adicionales para interpretar correctamente tu consulta.",
          clarificationQuestions: Array.isArray(safetyResult.questions) ? safetyResult.questions : [],
          citations: []
        };
      }

      if (safetyResult.decision === "block") {
        return {
          status: "blocked",
          coverage: coverageResult.status,
          answer: typeof safetyResult.message === "string"
            ? safetyResult.message
            : "No es posible proporcionar esa orientación con la información y las condiciones disponibles.",
          citations: []
        };
      }

      requireMethod(configured.answerGenerator, "generate", "answerGenerator");

      const missingInformation = Array.isArray(coverageResult.missingInformation)
        ? coverageResult.missingInformation
        : [];

      const generated = await configured.answerGenerator.generate({
        question,
        evidence: publicEvidence(evidence),
        coverage: coverageResult.status,
        missingInformation,
        instructions: {
          useOnlyProvidedEvidence: true,
          doNotInventFacts: true,
          citeEverySupportedClaim: true,
          discloseMissingInformation: coverageResult.status === "partial"
        }
      });

      if (!generated || typeof generated.text !== "string" || !generated.text.trim()) {
        throw new AskAdapterError("El generador no devolvió una respuesta válida.", "INVALID_GENERATED_ANSWER");
      }

      const citations = buildCitations(generated.citationIds, evidence);

      return {
        status: coverageResult.status === "partial" ? "partial" : "answered",
        coverage: coverageResult.status,
        answer: generated.text.trim(),
        citations,
        missingInformation
      };
    }
  };
}

module.exports = {
  createAskOrchestrator,
  validateQuestion,
  AskInputError,
  AskAdapterError
};
