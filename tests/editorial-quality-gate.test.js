"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateEditorialArticle } = require("../src/services/publisher/editorial-quality-gate");

function fixture(overrides = {}) {
  const source1 = {
    url: "https://materials.example.org/concrete",
    title: "Concrete material properties",
    excerpt: "Concrete cement aggregates water ratio compressive strength curing construction material tests.",
    evidenceText: "El concreto se produce con cemento, agregados y agua. La relación agua-cemento afecta la resistencia a compresión, la trabajabilidad y la durabilidad. El curado conserva humedad para la hidratación del cemento. Los agregados deben cumplir requisitos de calidad y granulometría."
  };
  const source2 = {
    url: "https://engineering.example.net/structures",
    title: "Structural concrete engineering",
    excerpt: "Structural concrete reinforcement design and quality control methods.",
    evidenceText: "El concreto estructural combina concreto y acero de refuerzo. El control de calidad incluye muestreo, ensayos de compresión, colocación, compactación, vibrado y procedimientos de curado. Las especificaciones identifican criterios de aceptación y responsabilidades."
  };
  const body = [
    "# Definición del concreto",
    "El concreto es un material compuesto por cemento, agregados y agua, utilizado en elementos de construcción [1].",
    "## Componentes y propiedades",
    "La relación agua-cemento influye en la resistencia a compresión, la trabajabilidad y la durabilidad del material [1].",
    "Los agregados forman el esqueleto granular y deben cumplir requisitos de calidad y granulometría [1].",
    "## Aplicaciones estructurales",
    "En estructuras, el concreto puede combinarse con acero de refuerzo para resistir distintos esfuerzos [2].",
    "El diseño estructural considera las propiedades del concreto y del acero de refuerzo, así como los criterios de control de calidad [2].",
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
    "La dosificación del concreto depende de la relación agua-cemento y de la calidad de los agregados [1].",
    "La selección de procedimientos de colocación, compactación, vibrado y curado debe documentarse en el control de calidad [2].",
    "La pasta formada por cemento y agua envuelve los agregados y desarrolla propiedades que dependen de la relación agua-cemento y de la hidratación [1].",
    "Una relación agua-cemento adecuada contribuye a equilibrar resistencia, trabajabilidad y durabilidad, siempre dentro de las especificaciones del proyecto [1].",
    "En elementos de concreto reforzado, el acero de refuerzo trabaja en conjunto con el concreto y requiere colocación y recubrimiento compatibles con el diseño [2].",
    "El muestreo y las pruebas de resistencia permiten documentar el comportamiento del concreto y revisar los resultados frente a los criterios de calidad [2].",
    "Las operaciones de colocación, vibración y curado deben coordinarse para conservar la uniformidad del concreto y reducir defectos durante la ejecución [2].",
    "El curado mantiene humedad disponible para la hidratación del cemento, proceso que influye en la resistencia y la durabilidad del concreto endurecido [1].",
    "La calidad de los agregados y su combinación con cemento y agua afectan la trabajabilidad de la mezcla y las propiedades del concreto producido [1].",
    "Los registros de control de calidad deben relacionar muestreo, ensayos, colocación y resultados para facilitar la trazabilidad de los elementos estructurales [2]."
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
