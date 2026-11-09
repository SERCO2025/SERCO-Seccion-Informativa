"use strict";

const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");
const { createSequentialAnswerGenerator } = require("../src/services/ai/sequential-answer-generator");
const { createSupabaseKnowledgeRetriever } = require("../src/services/knowledge/supabase-knowledge-retriever");

// El recuperador real y el failover quedan inyectados en el orquestador.
// La ruta responde SERVICE_NOT_READY hasta conectar cobertura y control de seguridad;
// el orquestador valida esos adaptadores antes de ejecutar una consulta a Supabase.
const orchestrator = createAskOrchestrator({
  retriever: createSupabaseKnowledgeRetriever(),
  answerGenerator: createSequentialAnswerGenerator()
});
const handler = createAskHttpHandler(orchestrator);

module.exports = handler;
