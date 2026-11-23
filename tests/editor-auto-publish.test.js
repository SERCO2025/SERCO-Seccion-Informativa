"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectPendingTopic } = require("../api/editor-auto-publish");

test("selectPendingTopic rota entre temas cuando un intento anterior no generó artículo", () => {
  const topics = [["Tema A"], ["Tema B"], ["Tema C"], ["Tema D"]];
  const start = new Date("2026-11-23T00:00:00.000Z");
  const first = selectPendingTopic(topics, new Set(), start);
  const next = selectPendingTopic(topics, new Set(), new Date(start.getTime() + 20 * 60 * 1000));
  assert.notEqual(first, next);
});

test("selectPendingTopic omite artículos ya existentes y conserva el orden circular", () => {
  const topics = [["Tema A"], ["Tema B"], ["Tema C"]];
  const titles = new Set(["diccionario técnico: tema b"]);
  const selected = selectPendingTopic(topics, titles, new Date(0));
  assert.equal(selected, topics[0]);
});

test("selectPendingTopic devuelve null cuando todos los temas ya existen", () => {
  const topics = [["Tema A"], ["Tema B"]];
  const titles = new Set(topics.map(([topic]) => ("Diccionario técnico: " + topic).toLowerCase()));
  assert.equal(selectPendingTopic(topics, titles, new Date()), null);
});

test("selectPendingTopic acepta fechas inválidas sin bloquear la cola", () => {
  const topics = [["Tema A"], ["Tema B"]];
  const selected = selectPendingTopic(topics, new Set(), "fecha inválida");
  assert.ok(topics.includes(selected));
});


const {
  isSeriousConstructionSourceCandidate,
  createConstructionSearchProvider,
  TOPICS
} = require("../api/editor-auto-publish");

test("admite fuentes serias de distintos sectores sin exigir dominio universitario o gubernamental", () => {
  for (const source of [
    { url: "https://www.fhwa.dot.gov/bridge/", title: "FHWA bridge guidance", content: "Technical guidance with design criteria, methods, specifications and references." },
    { url: "https://engineering.berkeley.edu/", title: "University engineering study", content: "Research findings, methods, measured data and technical references." },
    { url: "https://www.astm.org/", title: "ASTM standards", content: "Standards, test methods, scope and technical specifications." },
    { url: "https://manufacturer.example/technical-data", title: "Concrete product technical data", content: "Published product specifications, test results, application limits and installation instructions." },
    { url: "https://engineering-firm.example/reports", title: "Geotechnical engineering report", content: "Authored engineering report describing site investigation, sampling, test methods and findings." },
    { url: "https://specialist.example/blog/concrete", title: "Concrete engineering field notes", content: "Detailed technical explanation with test references, measurements and documented methods." }
  ]) {
    assert.equal(isSeriousConstructionSourceCandidate(source), true, source.url);
  }
});

test("rechaza URLs inseguras, redes sociales y contenido sin sustancia técnica", () => {
  for (const source of [
    { url: "http://www.fhwa.dot.gov/bridge/", title: "FHWA guidance", content: "Technical guidance with sufficient detail and references." },
    { url: "https://reddit.com/r/construction", title: "Construction discussion", content: "A sufficiently long user discussion but not a technical source." },
    { url: "https://example.com/", title: "Short", content: "Tiny" },
    { url: "https://user:pass@example.com/report", title: "Technical report", content: "Detailed engineering report with methodology, test results and references." }
  ]) {
    assert.equal(isSeriousConstructionSourceCandidate(source), false, source.url);
  }
});

test("el buscador conserva fuentes técnicas privadas y descarta plataformas de contenido social", async () => {
  const provider = createConstructionSearchProvider({
    async search() {
      return {
        provider: "tavily",
        results: [
          { url: "https://www.fhwa.dot.gov/bridge/", title: "FHWA", content: "Datos técnicos suficientes para evaluar criterios de diseño y referencias." },
          { url: "https://manufacturer.example/specs", title: "Fabricante", content: "Ficha técnica con especificaciones, ensayos y límites de aplicación del material." },
          { url: "https://reddit.com/r/example", title: "Publicación social", content: "Texto suficientemente largo, pero alojado en plataforma excluida." }
        ],
        resultCount: 3
      };
    },
    async extract(input) {
      return { results: [], requested: input.urls.length };
    }
  });
  const result = await provider.search({ query: "concreto" });
  assert.equal(result.resultCount, 2);
  assert.deepEqual(result.results.map((source) => source.title), ["FHWA", "Fabricante"]);
});

test("no permite investigar con menos de dos candidatos técnicos sustanciales", async () => {
  const provider = createConstructionSearchProvider({
    async search() {
      return {
        results: [
          { url: "https://reddit.com/r/construction", title: "Foro", content: "Texto suficientemente largo pero sin respaldo técnico identificable." },
          { url: "https://www.fhwa.dot.gov/", title: "FHWA", content: "Contenido técnico suficiente para evaluar y contrastar." }
        ],
        resultCount: 2
      };
    }
  });
  await assert.rejects(provider.search({ query: "pavimentos" }), {
    code: "INSUFFICIENT_CONSTRUCTION_SOURCE_CANDIDATES"
  });
});

test("la cola editorial contiene exclusivamente temas de construcción civil y edificación", () => {
  assert.ok(TOPICS.length >= 50);
  const serialized = JSON.stringify(TOPICS).toLowerCase();
  for (const excluded of [
    "audio y producción musical",
    "traducción certificada",
    "vinil de corte",
    "identidad corporativa",
    "motor de combustión interna",
    "brujería",
    "radiestesia"
  ]) {
    assert.equal(serialized.includes(excluded), false, excluded);
  }
  for (const topic of TOPICS) {
    assert.equal(topic.length, 3);
    assert.match(topic[2], /construcción|obra|edificación|infraestructura|ensayos|topografía|presupuesto|transporte|habitabilidad|geotecnia|cimentaciones|materiales|estructural|carreteras|puentes|instalaciones|arquitectura|ejecución|administración/i);
  }
});
