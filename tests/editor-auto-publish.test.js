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
  isTrustedConstructionSource,
  createConstructionSearchProvider,
  TOPICS
} = require("../api/editor-auto-publish");

test("admite fuentes HTTPS gubernamentales, universitarias y técnicas reconocidas", () => {
  for (const url of [
    "https://www.fhwa.dot.gov/bridge/",
    "https://www.gob.mx/sct",
    "https://engineering.berkeley.edu/",
    "https://www.astm.org/",
    "https://www.concrete.org/",
    "https://www.unam.mx/",
    "https://www.ema.org.mx/"
  ]) {
    assert.equal(isTrustedConstructionSource({ url }), true, url);
  }
});

test("rechaza blogs, dominios comerciales genéricos y conexiones HTTP", () => {
  for (const url of [
    "https://example.com/construccion",
    "https://blog.example.org/concreto",
    "http://www.fhwa.dot.gov/bridge/",
    "https://fakegov.example.com/"
  ]) {
    assert.equal(isTrustedConstructionSource({ url }), false, url);
  }
});

test("el buscador de SERCO entrega al sintetizador solo fuentes institucionales admitidas", async () => {
  const provider = createConstructionSearchProvider({
    async search() {
      return {
        provider: "tavily",
        results: [
          { url: "https://www.fhwa.dot.gov/bridge/", title: "FHWA", content: "Datos técnicos" },
          { url: "https://engineering.berkeley.edu/", title: "Universidad", content: "Investigación" },
          { url: "https://example.com/", title: "Blog comercial", content: "Texto" }
        ],
        resultCount: 3
      };
    },
    async extract(input) {
      return { results: [], requested: input.urls.length };
    }
  });
  const result = await provider.search({ query: "puentes" });
  assert.equal(result.resultCount, 2);
  assert.deepEqual(result.results.map((source) => source.title), ["FHWA", "Universidad"]);
});

test("no permite sintetizar ni publicar con menos de dos fuentes institucionales", async () => {
  const provider = createConstructionSearchProvider({
    async search() {
      return {
        results: [
          { url: "https://example.com/", title: "Blog", content: "Texto" },
          { url: "https://www.fhwa.dot.gov/", title: "FHWA", content: "Texto" }
        ],
        resultCount: 2
      };
    }
  });
  await assert.rejects(provider.search({ query: "pavimentos" }), {
    code: "INSUFFICIENT_TRUSTED_CONSTRUCTION_SOURCES"
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
