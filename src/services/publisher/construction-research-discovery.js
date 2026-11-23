"use strict";

const SEARCH_PLANS = Object.freeze([
  {
    topic: "Resistencia a compresión del concreto",
    category: "Materiales y ensayos",
    specialty: "Tecnología del concreto y control de calidad",
    query: "ensayo resistencia a compresión concreto cilindros probetas ASTM C39 NMX método preparación curado velocidad carga resultados laboratorio concrete compressive strength test cylinders laboratory procedure",
    focus: "métodos de ensayo, preparación de probetas, curado, medición y criterios de aceptación de resistencia a compresión del concreto"
  },
  {
    topic: "Curado del concreto hidráulico",
    category: "Materiales y ejecución de obra",
    specialty: "Tecnología del concreto",
    query: "curado concreto hidráulico métodos membrana humedad temperatura duración resistencia durabilidad especificación técnica concrete curing methods moisture temperature duration strength durability",
    focus: "procedimientos de curado, control de humedad y temperatura, duración y efectos medibles sobre resistencia y durabilidad"
  },
  {
    topic: "Granulometría de agregados para concreto",
    category: "Materiales y ensayos",
    specialty: "Materiales de construcción y laboratorio",
    query: "granulometría agregados arena grava concreto análisis tamices módulo finura ASTM C136 ensayo laboratorio gradation fine coarse aggregates sieve analysis concrete",
    focus: "procedimiento de análisis por tamices, curvas granulométricas, módulo de finura y requisitos de agregados"
  },
  {
    topic: "Corrosión del acero de refuerzo en concreto",
    category: "Patología y durabilidad",
    specialty: "Estructuras de concreto reforzado y materiales",
    query: "corrosión acero refuerzo concreto carbonatación cloruros potencial media celda evaluación reparación durabilidad reinforced concrete rebar corrosion chloride carbonation assessment",
    focus: "mecanismos de corrosión, métodos de diagnóstico, evaluación de cloruros y medidas de protección o reparación"
  },
  {
    topic: "Capacidad de carga de cimentaciones superficiales",
    category: "Cimentaciones y geotecnia",
    specialty: "Ingeniería geotécnica y cimentaciones",
    query: "capacidad carga cimentaciones superficiales zapatas cálculo asentamiento suelo parámetros geotécnicos método Terzaghi Meyerhof shallow foundation bearing capacity settlement design",
    focus: "parámetros geotécnicos, métodos de cálculo, factores de seguridad y estimación de asentamientos en zapatas"
  },
  {
    topic: "Ensayo de penetración estándar SPT",
    category: "Geotecnia y exploración del subsuelo",
    specialty: "Mecánica de suelos y geotecnia",
    query: "ensayo penetración estándar SPT procedimiento campo corrección energía N60 muestreador interpretación informe geotécnico standard penetration test field procedure corrections",
    focus: "equipo, procedimiento de campo, registro de golpes, correcciones e interpretación de resultados SPT"
  },
  {
    topic: "Diseño de mezclas asfálticas para pavimentos",
    category: "Pavimentos e infraestructura",
    specialty: "Ingeniería de pavimentos y materiales viales",
    query: "diseño mezcla asfáltica pavimento método Marshall granulometría estabilidad flujo vacíos contenido asfalto ensayo laboratorio asphalt mix design Marshall stability flow",
    focus: "dosificación, ensayos Marshall, estabilidad, flujo, vacíos y control de calidad de mezclas asfálticas"
  },
  {
    topic: "Compactación de suelos mediante Proctor",
    category: "Geotecnia y terracerías",
    specialty: "Mecánica de suelos y control de obra",
    query: "ensayo Proctor estándar modificado compactación suelos humedad óptima peso volumétrico seco ASTM D698 D1557 procedimiento laboratorio soil compaction test",
    focus: "energía de compactación, humedad óptima, peso volumétrico seco máximo y control de compactación en campo"
  },
  {
    topic: "Impermeabilización de cubiertas y azoteas",
    category: "Edificación y sistemas constructivos",
    specialty: "Arquitectura y tecnología de la construcción",
    query: "impermeabilización cubiertas azoteas sistemas membranas prefabricadas aplicación preparación sustrato pruebas estanqueidad especificación técnica roof waterproofing membrane installation testing",
    focus: "sistemas de impermeabilización, preparación de sustratos, detalles constructivos y pruebas de estanqueidad"
  },
  {
    topic: "Morteros para mampostería de bloques",
    category: "Materiales y sistemas constructivos",
    specialty: "Albañilería y materiales de construcción",
    query: "mortero mampostería bloques concreto dosificación propiedades adherencia resistencia compresión ASTM C270 ensayo especificación masonry mortar proportion properties bond strength",
    focus: "dosificación, propiedades, clasificación, adherencia, resistencia y control de calidad de morteros para mampostería"
  },
  {
    topic: "Procedimientos de soldadura en acero estructural",
    category: "Estructuras metálicas",
    specialty: "Ingeniería estructural y fabricación de acero",
    query: "soldadura acero estructural procedimiento WPS calificación soldador inspección visual ensayos no destructivos AWS D1.1 structural steel welding procedure inspection",
    focus: "especificaciones WPS, calificación, inspección, discontinuidades y ensayos aplicables a uniones soldadas estructurales"
  },
  {
    topic: "Prueba de revenimiento del concreto fresco",
    category: "Control de calidad en obra",
    specialty: "Tecnología del concreto y supervisión de obra",
    query: "prueba revenimiento concreto fresco cono Abrams procedimiento ASTM C143 asentamiento consistencia muestreo aceptación fresh concrete slump test procedure",
    focus: "muestreo, procedimiento del cono de Abrams, medición del asentamiento, límites y criterios de aceptación"
  }
]);

const EXCLUDED_HOSTS = Object.freeze([
  "facebook.com", "instagram.com", "tiktok.com", "pinterest.com",
  "quora.com", "reddit.com", "x.com", "twitter.com", "threads.net"
]);

const OBJECT_TERMS = [
  "edificacion", "edificio", "vivienda", "obra civil", "obra de construccion",
  "puente", "carretera", "pavimento", "infraestructura", "cimentacion",
  "cimentaciones", "concreto", "hormigon", "cemento", "acero estructural",
  "mamposteria", "albanileria", "estructura", "estructural", "viga", "columna",
  "losa", "muro de contencion", "excavacion", "geotecnia", "mecanica de suelos",
  "topografia", "mezcla asfaltica", "drenaje pluvial", "materiales de construccion",
  "building", "buildings", "structural steel", "steel building", "building frame", "bridge", "bridges", "road", "pavement",
  "civil engineering", "structural engineering", "foundation", "foundations",
  "concrete", "reinforced concrete", "asphalt", "geotechnical", "soil mechanics",
  "construction site", "building materials", "steel structure", "masonry"
];

const TECHNICAL_TERMS = [
  "ficha tecnica", "especificacion", "especificaciones", "ensayo", "prueba",
  "metodologia", "metodo de ensayo", "resultado", "resultados", "resistencia",
  "dosificacion", "granulometria", "norma", "reglamento", "manual tecnico",
  "informe tecnico", "memoria de calculo", "control de calidad", "dimensionamiento",
  "criterios de diseno", "procedimiento constructivo", "propiedades mecanicas",
  "technical data", "technical specification", "laboratory test", "load testing", "testing procedures", "test method", "test results", "material specifications", "welding procedures",
  "laboratory report", "engineering report", "design criteria", "structural design",
  "material properties", "quality control", "construction method", "case study",
  "technical manual", "standard specification", "field testing"
];

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text, terms) {
  return terms.reduce((count, term) => count + (text.includes(normalize(term)) ? 1 : 0), 0);
}

function getSafeHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (EXCLUDED_HOSTS.some((domain) => host === domain || host.endsWith("." + domain))) return null;
    return host;
  } catch {
    return null;
  }
}

function assessConstructionDocument(source, options = {}) {
  if (!source || typeof source.title !== "string" || typeof source.url !== "string") {
    return { relevant: false, reason: "INVALID_SOURCE" };
  }
  const host = getSafeHost(source.url);
  if (!host) return { relevant: false, reason: "UNSAFE_OR_EXCLUDED_HOST" };

  const title = normalize(source.title);
  const content = normalize(source.rawContent || source.content || source.snippet || source.excerpt || "");
  const combined = title + " " + content;
  const objectMatches = countMatches(combined, OBJECT_TERMS);
  const technicalMatches = countMatches(combined, TECHNICAL_TERMS);
  const minimumLength = options.requireFullDocument ? 500 : 60;

  if (content.length < minimumLength) return { relevant: false, reason: "INSUFFICIENT_DOCUMENT_CONTENT", host };
  if (objectMatches < 1) return { relevant: false, reason: "NO_PHYSICAL_CONSTRUCTION_CONTEXT", host };
  if (technicalMatches < 1) return { relevant: false, reason: "NO_TECHNICAL_CONTENT_SIGNAL", host };
  if (options.requireFullDocument && (objectMatches < 2 || technicalMatches < 2)) {
    return { relevant: false, reason: "INSUFFICIENT_TECHNICAL_DEPTH", host };
  }

  const score = objectMatches * 3 + technicalMatches * 2 +
    (typeof source.score === "number" ? Math.max(0, Math.min(1, source.score)) : 0);
  return { relevant: true, reason: "CONSTRUCTION_TECHNICAL_DOCUMENT", host, score, objectMatches, technicalMatches };
}

const TOPIC_STOP_WORDS = new Set([
  "about", "after", "also", "among", "based", "case", "control", "data", "design",
  "document", "engineering", "field", "general", "guide", "industry", "manual",
  "method", "methods", "project", "quality", "report", "research", "result",
  "results", "standard", "study", "technical", "testing", "using", "with",
  "construction", "constructive", "civil", "building", "material", "materials",
  "obra", "tecnico", "tecnica", "tecnicos", "tecnicas", "informe", "estudio",
  "metodo", "metodos", "control", "calidad", "proyecto", "proyectos", "resultados",
  "ingenieria", "construccion", "construcciones"
]);

function getTopicTerms(source) {
  const text = normalize(source && source.title);
  return new Set(text.split(" ").filter((word) => word.length >= 5 && !TOPIC_STOP_WORDS.has(word)));
}

function countSharedTopicTerms(first, second) {
  const firstTerms = getTopicTerms(first);
  const secondTerms = getTopicTerms(second);
  let shared = 0;
  for (const term of firstTerms) if (secondTerms.has(term)) shared += 1;
  return shared;
}

function selectSearchPlan(now = new Date(), existingTopics = []) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  const slot = Math.floor(safeTimestamp / (30 * 60 * 1000));
  const used = (Array.isArray(existingTopics) ? existingTopics : [])
    .map((topic) => normalize(topic))
    .filter(Boolean);
  const available = SEARCH_PLANS.filter((plan) =>
    !used.some((title) => title.includes(normalize(plan.topic)))
  );
  if (!available.length) return null;
  return available[((slot % available.length) + available.length) % available.length];
}

function createConstructionResearchDiscovery(provider, options = {}) {
  const maxCandidates = Number.isInteger(options.maxCandidates) ? Math.max(2, Math.min(options.maxCandidates, 6)) : 4;
  const minDocumentLength = Number.isInteger(options.minDocumentLength) ? options.minDocumentLength : 500;

  return {
    async discover(input = {}) {
      if (!provider || typeof provider.search !== "function" || typeof provider.extract !== "function") {
        const error = new Error("La investigación documental requiere búsqueda y extracción de contenido.");
        error.code = "CONSTRUCTION_DISCOVERY_NOT_CONFIGURED";
        throw error;
      }

      const plan = input.plan || selectSearchPlan(input.now, input.existingTopics);
      if (!plan) {
        return { status: "no_topics_available", searched: false, candidateCount: 0, sources: [] };
      }
      const existingSourceUrls = input.existingSourceUrls instanceof Set
        ? new Set([...input.existingSourceUrls].map((url) => String(url).split("#")[0].replace(/\/$/, "").toLowerCase()))
        : new Set();
      const searchResult = await provider.search({ query: plan.query });
      const seenUrls = new Set();
      const candidates = (Array.isArray(searchResult.results) ? searchResult.results : [])
        .map((source) => {
          const assessment = assessConstructionDocument(source);
          return { source, assessment };
        })
        .filter(({ source, assessment }) => {
          if (!assessment.relevant) return false;
          const key = String(source.url).split("#")[0].replace(/\/$/, "").toLowerCase();
          if (seenUrls.has(key) || existingSourceUrls.has(key)) return false;
          seenUrls.add(key);
          return true;
        })
        .sort((a, b) => b.assessment.score - a.assessment.score)
        .slice(0, maxCandidates);

      if (candidates.length < 2) {
        return { status: "no_relevant_documents", plan: plan.category, searched: true, candidateCount: candidates.length, sources: [] };
      }

      const extracted = await provider.extract({
        urls: candidates.map(({ source }) => source.url),
        query: plan.query
      });
      const extractedByUrl = new Map((Array.isArray(extracted.results) ? extracted.results : [])
        .filter((item) => item && typeof item.url === "string" && typeof item.rawContent === "string")
        .map((item) => [item.url.split("#")[0].replace(/\/$/, "").toLowerCase(), item.rawContent]));

      const verifiedCandidates = candidates.map(({ source, assessment }) => {
        const key = source.url.split("#")[0].replace(/\/$/, "").toLowerCase();
        const rawContent = extractedByUrl.get(key) || "";
        const document = Object.assign({}, source, { rawContent });
        const fullAssessment = assessConstructionDocument(document, { requireFullDocument: true });
        return { source: document, assessment: fullAssessment, preliminaryAssessment: assessment };
      }).filter(({ source, assessment }) => source.rawContent.length >= minDocumentLength && assessment.relevant);

      const uniqueHosts = new Set(verifiedCandidates.map(({ assessment }) => assessment.host));
      if (verifiedCandidates.length < 2 || uniqueHosts.size < 2) {
        return {
          status: "no_relevant_documents",
          plan: plan.category,
          searched: true,
          candidateCount: candidates.length,
          extractedCount: extractedByUrl.size,
          acceptedCount: verifiedCandidates.length,
          sources: []
        };
      }

      const ranked = verifiedCandidates.sort((a, b) => b.assessment.score - a.assessment.score);
      const lead = ranked[0].source;
      const related = ranked.filter(({ source }) => countSharedTopicTerms(lead, source) >= 2);
      const relatedHosts = new Set(related.map(({ assessment }) => assessment.host));
      if (related.length < 2 || relatedHosts.size < 2) {
        return {
          status: "no_relevant_documents",
          plan: plan.category,
          searched: true,
          candidateCount: candidates.length,
          extractedCount: extractedByUrl.size,
          acceptedCount: verifiedCandidates.length,
          relatedDocumentCount: related.length,
          sources: []
        };
      }
      const selected = related.slice(0, 4);
      return {
        status: "ready",
        plan: plan.category,
        specialty: plan.specialty,
        focus: plan.focus,
        topic: plan.topic,
        query: plan.query,
        sources: selected.map(({ source, assessment }) => Object.assign({}, source, {
          relevance: {
            score: assessment.score,
            constructionSignals: assessment.objectMatches,
            technicalSignals: assessment.technicalMatches
          }
        })),
        candidateCount: candidates.length,
        acceptedCount: selected.length
      };
    }
  };
}

module.exports = {
  SEARCH_PLANS,
  OBJECT_TERMS,
  TECHNICAL_TERMS,
  assessConstructionDocument,
  countSharedTopicTerms,
  selectSearchPlan,
  createConstructionResearchDiscovery
};
