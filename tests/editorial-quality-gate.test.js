"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEditorialArticle } = require("../src/services/publisher/editorial-quality-gate");

function fixture(overrides = {}) {
  const source1 = {
    url: "https://materials.example.org/concrete",
    title: "Concrete material properties",
    excerpt: "Concrete cement aggregates water ratio compressive strength curing construction material tests.",
    evidenceText: "Concrete is produced from cement, aggregates and water. The water cement ratio affects compressive strength, workability and durability. Curing maintains moisture for hydration."
  };
  const source2 = {
    url: "https://engineering.example.net/structures",
    title: "Structural concrete engineering",
    excerpt: "Structural concrete reinforcement design and quality control methods.",
    evidenceText: "Structural concrete combines concrete and steel reinforcement. Quality control includes sampling, compressive testing, placement, vibration and curing procedures."
  };
  const body = [
    "# Definición del concreto",
    "El concreto es un material compuesto por cemento, agregados y agua, utilizado en elementos de construcción [1].",
    "## Componentes y propiedades",
    "La relación agua-cemento influye en la resistencia a compresión, la trabajabilidad y la durabilidad del material [1].",
    "Los agregados forman el esqueleto granular y deben cumplir requisitos de calidad y granulometría [1].",
    "## Aplicaciones estructurales",
    "En estructuras, el concreto puede combinarse con acero de refuerzo para resistir distintos esfuerzos [2].",
    "El diseño considera cargas, geometría, materiales y condiciones de exposición [2].",
    "## Ejecución y control",
    "La colocación requiere procedimientos que eviten segregación y pérdida de uniformidad [2].",
    "La compactación mediante vibrado ayuda a reducir vacíos cuando se aplica correctamente [2].",
    "## Curado y durabilidad",
    "El curado conserva condiciones de humedad necesarias para la hidratación del cemento [1].",
    "La evaluación de resistencia requiere muestreo y ensayos conforme al método aplicable [2].",
    "## Control de calidad",
    "El control de calidad documenta materiales, colocación, curado y resultados de ensayos [2].",
    "Las especificaciones deben identificar criterios de aceptación y responsabilidades [2].",
    "## Limitaciones",
    "La dosificación no debe definirse sin considerar exposición, requisitos estructurales y materiales disponibles [1].",
    "La selección de procedimientos depende de las condiciones reales de la obra [2]."
  ].join("\n\n");
  const claimEvidence = body.split("\n\n").filter((line) => /\[\d+\]/.test(line)).map((claim) => ({
    section: "expandedAnswer",
    claim,
    assessment: "supported",
    sourceIds: [...claim.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]))
  }));
  return {
    topic: "Concreto",
    body,
    internalReport: "Informe documental ".repeat(100),
    sources: [source1, source2],
    claimEvidence,
    ...overrides
  };
}

test("aprueba artículos técnicos con citas diversas y coincidencia entre afirmaciones y extractos", () => {
  const result = validateEditorialArticle(fixture());
  assert.equal(result.passed, true);
  assert.equal(result.distinctSourceDomains, 2);
  assert.equal(result.independentlyVerified, false);
});

test("rechaza artículos fuera de tema", () => {
  assert.throws(
    () => validateEditorialArticle(fixture({ topic: "Diseño de sitios web" })),
    { code: "EDITORIAL_TOPIC_MISMATCH" }
  );
});

test("rechaza artículos sin apartados técnicos suficientes", () => {
  assert.throws(
    () => validateEditorialArticle(fixture({ body: "# Concreto\n\nTexto ".repeat(200) })),
    { code: "EDITORIAL_INSUFFICIENT_STRUCTURE" }
  );
});

test("rechaza citas que no aportan extracto documental suficiente", () => {
  const data = fixture();
  data.sources[0].evidenceText = "Texto corto";
  assert.throws(() => validateEditorialArticle(data), { code: "EDITORIAL_WEAK_SOURCE_EVIDENCE" });
});

test("rechaza afirmaciones que el propio modelo no considera respaldadas", () => {
  const data = fixture();
  data.claimEvidence[0].assessment = "uncertain";
  assert.throws(() => validateEditorialArticle(data), { code: "EDITORIAL_UNSUPPORTED_CLAIM" });
});

test("rechaza afirmaciones sin coincidencia léxica suficiente con sus fuentes citadas", () => {
  const data = fixture();
  data.claimEvidence[0].sourceIds = [2];
  assert.throws(() => validateEditorialArticle(data), { code: "EDITORIAL_CLAIM_EVIDENCE_MISMATCH" });
});

test("rechaza artículos que citan un solo dominio aunque tengan varias URL", () => {
  const data = fixture();
  data.sources[1].url = "https://materials.example.org/other";
  assert.throws(() => validateEditorialArticle(data), { code: "EDITORIAL_INSUFFICIENT_SOURCE_INDEPENDENCE" });
});
