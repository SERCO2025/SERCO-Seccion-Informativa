"use strict";

const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");
const { createSequentialAnswerGenerator } = require("../src/services/ai/sequential-answer-generator");

// El selector queda conectado al orquestador RAG. La ruta continúa deshabilitada
// hasta conectar el recuperador, evaluador de cobertura y control de seguridad.
const answerGenerator = createSequentialAnswerGenerator();
const orchestrator = createAskOrchestrator({ answerGenerator });
const handler = createAskHttpHandler(orchestrator);

module.exports = handler;
