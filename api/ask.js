"use strict";

const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");
const { createSequentialAnswerGenerator } = require("../src/services/ai/sequential-answer-generator");
const { createSupabaseKnowledgeRetriever } = require("../src/services/knowledge/supabase-knowledge-retriever");
const { createEvidenceCoverageEvaluator } = require("../src/services/ai/evidence-coverage-evaluator");
const { createConstructionSafetyGuard } = require("../src/services/ai/construction-safety-guard");
const { createPublicRateLimiter } = require("../src/services/security/public-api-rate-limiter");

const orchestrator = createAskOrchestrator({
  retriever: createSupabaseKnowledgeRetriever(),
  coverageEvaluator: createEvidenceCoverageEvaluator(),
  safetyGuard: createConstructionSafetyGuard(),
  answerGenerator: createSequentialAnswerGenerator()
});
const rateLimiter = createPublicRateLimiter();
const handler = createAskHttpHandler(orchestrator, {
  // Validar cuerpo y pregunta antes de descontar la cuota del visitante.
  beforeAsk: (req) => rateLimiter.consume(req, "ask")
});

module.exports = handler;
