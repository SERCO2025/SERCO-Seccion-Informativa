"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SEARCH_PLANS,
  assessConstructionDocument,
  selectSearchPlan,
  createConstructionResearchDiscovery
} = require("../src/services/publisher/construction-research-discovery");

const rawBridge = ("Concrete bridge deck repair technical report. Bridge deck concrete repair includes surface preparation, structural inspection, reinforcement protection, repair mortar specifications, compressive strength testing, curing procedures, quality control and documented field test results. ").repeat(8);
const rawBuilding = ("Concrete bridge deck repair laboratory test report. The laboratory report evaluates bridge deck concrete repair, repair mortar, surface preparation, compressive strength testing, curing and field quality control. ").repeat(8);
const rawSteel = ("Structural steel building connection laboratory test report. The building frame uses steel structural connections, bolted joints, welding procedures, load testing, material specifications, measured deformation and engineering acceptance criteria. ").repeat(8);

function makeProvider() {
  const extractedUrls = [];
  const results = [
    {
      url: "https://contractor.example/projects/bridge-deck",
      title: "Concrete bridge deck repair technical report",
      content: "Bridge deck concrete repair, surface preparation, repair mortar specifications and field testing.",
      score: 0.92
    },
    {
      url: "https://laboratory.example/reports/steel-joints",
      title: "Bridge deck concrete repair laboratory test report",
      content: "Bridge deck concrete repair, repair mortar specifications, surface preparation and compressive strength test results.",
      score: 0.88
    },
    {
      url: "https://steel-lab.example/reports/connections",
      title: "Structural steel building connection laboratory test report",
      content: "Building steel frame connections, bolted joints, welding procedures and measured load test results.",
      score: 0.85
    },
    {
      url: "https://social.example.invalid/post",
      title: "Construction is the foundation of a better future",
      content: "A long discussion about building a better future and constructing stronger relationships in the community."
    }
  ];
  return {
    extractedUrls,
    async search({ query }) {
      return { provider: "tavily", query, results };
    },
    async extract({ urls }) {
      extractedUrls.push(...urls);
      return {
        results: [
          { url: urls[0], rawContent: rawBridge },
          { url: urls[1], rawContent: rawBuilding },
          { url: urls[2], rawContent: rawSteel }
        ]
      };
    }
  };
}

test("la selección de búsqueda rota entre documentación real de obra, fabricantes, laboratorios y normas", () => {
  assert.equal(SEARCH_PLANS.length, 12);
  const first = selectSearchPlan(new Date("2026-11-23T00:00:00.000Z"));
  const next = selectSearchPlan(new Date("2026-11-23T00:30:00.000Z"));
  assert.notEqual(first.topic, next.topic);
  assert.ok(SEARCH_PLANS.every((plan) =>
    plan.topic && plan.query.includes(plan.topic.split(" ")[0]) &&
    /concreto|geotecnia|pavimento|acero|mamposteria|impermeabilizacion|mortero/i.test(plan.query + plan.focus)
  ));
});

test("el filtro exige contexto de construcción física y contenido técnico", () => {
  assert.equal(assessConstructionDocument({
    url: "https://engineering.example/concrete",
    title: "Concrete bridge deck repair technical report",
    content: "Bridge deck concrete repair, specifications, test methods and results."
  }).relevant, true);
  assert.equal(assessConstructionDocument({
    url: "https://blog.example/future",
    title: "Construction of a better future",
    content: "Building relationships and constructing a better future for families."
  }).relevant, false);
  assert.equal(assessConstructionDocument({
    url: "https://reddit.com/r/construction",
    title: "Concrete bridge technical test",
    content: "Bridge deck concrete repair specifications and laboratory test results."
  }).reason, "UNSAFE_OR_EXCLUDED_HOST");
});

test("extrae documentos originales solo después del filtro preliminar y entrega únicamente documentos técnicos completos", async () => {
  const provider = makeProvider();
  const discovery = createConstructionResearchDiscovery(provider);
  const result = await discovery.discover({ now: new Date("2026-11-23T00:00:00.000Z") });
  assert.equal(result.status, "ready");
  assert.equal(result.sources.length, 2);
  assert.equal(provider.extractedUrls.length, 3);
  assert.ok(result.sources.every((source) => source.rawContent.length >= 500));
  assert.ok(result.sources.every((source) => source.relevance.constructionSignals >= 2));
  assert.ok(result.sources.every((source) => source.relevance.technicalSignals >= 2));
});

test("no entrega a la IA documentos sin pertinencia técnica suficiente", async () => {
  let extractCalls = 0;
  const discovery = createConstructionResearchDiscovery({
    async search() {
      return {
        results: [{
          url: "https://example.com/future",
          title: "Building a better future",
          content: "Building stronger relationships and constructing a better future for families."
        }]
      };
    },
    async extract() { extractCalls += 1; return { results: [] }; }
  });
  const result = await discovery.discover();
  assert.equal(result.status, "no_relevant_documents");
  assert.equal(result.sources.length, 0);
  assert.equal(extractCalls, 0);
});

test("no vuelve a considerar documentos fuente ya utilizados en publicaciones anteriores", async () => {
  const provider = makeProvider();
  const discovery = createConstructionResearchDiscovery(provider);
  const result = await discovery.discover({
    existingSourceUrls: new Set([
      "https://contractor.example/projects/bridge-deck",
      "https://laboratory.example/reports/steel-joints"
    ])
  });
  assert.equal(result.status, "no_relevant_documents");
  assert.equal(provider.extractedUrls.length, 0);
});


test("no realiza búsquedas cuando todos los temas del catálogo ya fueron publicados", async () => {
  let searchCalls = 0;
  const discovery = createConstructionResearchDiscovery({
    async search() { searchCalls += 1; return { results: [] }; },
    async extract() { throw new Error("No debe extraer"); }
  });
  const result = await discovery.discover({
    existingTopics: SEARCH_PLANS.map((plan) => "Diccionario técnico: " + plan.topic)
  });
  assert.equal(result.status, "no_topics_available");
  assert.equal(result.searched, false);
  assert.equal(searchCalls, 0);
});
