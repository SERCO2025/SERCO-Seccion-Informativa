"use strict";

const { createGeminiAnswerProvider } = require("../src/services/ai/providers/gemini-answer-provider");
const { createGroqAnswerProvider } = require("../src/services/ai/providers/groq-answer-provider");
const { createCloudflareAnswerProvider } = require("../src/services/ai/providers/cloudflare-answer-provider");

const evidence = [{
  id: "fixture-01",
  title: "Ficha ficticia de evaluación",
  section: "Dato documentado",
  content: "Este documento es ficticio y solo sirve para evaluar el modelo. Declara que el valor de prueba alfa es 25 unidades. No contiene ubicación, norma técnica ni recomendación de construcción."
}];

const scenarios = [
  {
    name: "sufficient",
    input: {
      question: "¿Qué valor de prueba alfa declara la ficha?",
      coverage: "sufficient",
      evidence
    }
  },
  {
    name: "partial",
    input: {
      question: "¿Qué valor declara la ficha y en qué ciudad debe aplicarse?",
      coverage: "partial",
      missingInformation: ["La ficha no identifica una ciudad ni un ámbito de aplicación."],
      evidence
    }
  }
];

const providers = [
  {
    name: "Gemini",
    configured: () => Boolean(process.env.GEMINI_API_KEY),
    create: () => createGeminiAnswerProvider()
  },
  {
    name: "Groq",
    configured: () => Boolean(process.env.GROQ_API_KEY),
    create: () => createGroqAnswerProvider()
  },
  {
    name: "Cloudflare Workers AI",
    configured: () => Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
    create: () => createCloudflareAnswerProvider()
  }
];

async function main() {
  const results = [];

  for (const definition of providers) {
    if (!definition.configured()) {
      results.push({ provider: definition.name, status: "skipped", reason: "Credenciales no configuradas." });
      continue;
    }

    const provider = definition.create();
    for (const scenario of scenarios) {
      const started = Date.now();
      try {
        const result = await provider.generate(scenario.input);
        results.push({
          provider: definition.name,
          model: result.model,
          scenario: scenario.name,
          status: "completed",
          durationMs: Date.now() - started,
          text: result.text,
          citationIds: result.citationIds,
          usage: result.usage
        });
      } catch (error) {
        results.push({
          provider: definition.name,
          model: provider.model,
          scenario: scenario.name,
          status: "failed",
          durationMs: Date.now() - started,
          code: error.code || "UNKNOWN_ERROR",
          message: error.message
        });
      }
    }
  }

  process.stdout.write(JSON.stringify({
    notice: "Fixture ficticio. Cada escenario configurado genera una solicitud API facturable si el proyecto tiene facturación habilitada. No habilites facturación para esta prueba.",
    results
  }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error && error.message ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
