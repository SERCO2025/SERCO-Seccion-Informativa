"use strict";

const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");
const { createSequentialAnswerGenerator } = require("../src/services/ai/sequential-answer-generator");
const { createSupabaseKnowledgeRetriever } = require("../src/services/knowledge/supabase-knowledge-retriever");
const { createEvidenceCoverageEvaluator } = require("../src/services/ai/evidence-coverage-evaluator");
const { createConstructionSafetyGuard } = require("../src/services/ai/construction-safety-guard");

// Componentes conectados en servidor. La ruta aún depende de las variables
// de entorno de Supabase y de los proveedores; no se publica desde esta rama.
const orchestrator = createAskOrchestrator({
  retriever: createSupabaseKnowledgeRetriever(),
  coverageEvaluator: createEvidenceCoverageEvaluator(),
  safetyGuard: createConstructionSafetyGuard(),
  answerGenerator: createSequentialAnswerGenerator()
});
const handler = createAskHttpHandler(orchestrator);

module.exports = handler;
