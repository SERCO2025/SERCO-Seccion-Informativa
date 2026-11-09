"use strict";

const { timingSafeEqual } = require("node:crypto");
const { createGeminiResearchProvider } = require("../src/services/research/gemini-research-provider");
const { createResearchHttpHandler } = require("../src/services/research/research-http-handler");

const provider = createGeminiResearchProvider();
const researchHandler = createResearchHttpHandler(provider);

function secureEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

module.exports = async function researchApi(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const expectedToken = process.env.SERCO_RESEARCH_ACCESS_TOKEN || "";
  if (!expectedToken) {
    return res.status(503).json({
      error: {
        code: "RESEARCH_ACCESS_NOT_CONFIGURED",
        message: "El acceso administrativo a investigación todavía no está configurado."
      }
    });
  }

  const authorization = req.headers && req.headers.authorization;
  const suppliedToken = typeof authorization === "string" && authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!suppliedToken || !secureEqual(suppliedToken, expectedToken)) {
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Se requiere autorización para iniciar una investigación."
      }
    });
  }

  return researchHandler(req, res);
};
