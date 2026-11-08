"use strict";

const { createAskOrchestrator } = require("../src/services/ai/ask-orchestrator");
const { createAskHttpHandler } = require("../src/services/ai/ask-http-handler");

// La ruta permanece deliberadamente deshabilitada hasta conectar y probar
// el recuperador, evaluador de cobertura, control de seguridad y generador.
const orchestrator = createAskOrchestrator({});
const handler = createAskHttpHandler(orchestrator);

module.exports = handler;
