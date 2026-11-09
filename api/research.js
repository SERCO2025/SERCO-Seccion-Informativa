"use strict";

const { createOpenAIResearchProvider } = require("../src/services/research/openai-research-provider");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");

const provider = createOpenAIResearchProvider();
module.exports = createResearchHttpHandler(provider);
