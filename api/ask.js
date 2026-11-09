"use strict";

const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");
const { createSequentialAnswerGenerator } = require("../src/services/ai/sequential-answer-generator");
const { createSupabaseKnowledgeRetriever } = require("../src/services/knowledge/supabase-knowledge-retriever");
const { createEvidenceCoverageEvaluator } = require("../src/services/ai/evidence-coverage-evaluator");
const { createConstructionSafetyGuard } = require("../src/services/ai/construction-safety-guard");
const {
  createPublicRateLimiter,
  PublicRateLimitConfigurationError
} = require("../src/services/security/public-api-rate-limiter");

const orchestrator = createAskOrchestrator({
  retriever: createSupabaseKnowledgeRetriever(),
  coverageEvaluator: createEvidenceCoverageEvaluator(),
  safetyGuard: createConstructionSafetyGuard(),
  answerGenerator: createSequentialAnswerGenerator()
});
const handler = createAskHttpHandler(orchestrator);
const rateLimiter = createPublicRateLimiter();

module.exports = async function askApi(req, res) {
  if (req.method === "POST") {
    try {
      const allowed = await rateLimiter.consume(req, "ask");
      if (!allowed) {
        return res.status(429).json({
          error: {
            code: "PUBLIC_RATE_LIMITED",
            message: "Se alcanzó el límite temporal de consultas. Inténtalo más tarde."
          }
        });
      }
    } catch (error) {
      const configurationError = error instanceof PublicRateLimitConfigurationError;
      return res.status(503).json({
        error: {
          code: configurationError ? error.code : "PUBLIC_RATE_LIMIT_UNAVAILABLE",
          message: "El servicio de consulta no está disponible temporalmente."
        }
      });
    }
  }
  return handler(req, res);
};
