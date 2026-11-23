"use strict";

const SEARCH_PLANS = Object.freeze([
  {
    category: "Proyectos y ejecución de obra",
    specialty: "Ingeniería civil, arquitectura e infraestructura",
    query: "casos de estudio documentación técnica de constructoras obras de edificación infraestructura civil metodología materiales especificaciones resultados contractor construction case studies civil engineering projects",
    focus: "proyectos documentados por constructoras y despachos de ingeniería"
  },
  {
    category: "Materiales y especificaciones",
    specialty: "Materiales, ensayos y tecnología de construcción",
    query: "fichas técnicas manuales especificaciones ensayos materiales de construcción concreto acero cemento agregados fabricantes manufacturer technical datasheets building materials concrete steel cement aggregate tests",
    focus: "fichas técnicas y documentación de fabricantes de materiales"
  },
  {
    category: "Laboratorio y control de calidad",
    specialty: "Geotecnia, laboratorio y control de calidad de obra",
    query: "informes de laboratorio ensayos geotécnicos concreto pavimentos suelos construcción método resultados técnicos construction materials testing laboratory geotechnical concrete pavement soil test report",
    focus: "informes de laboratorios y resultados de ensayos de construcción"
  },
  {
    category: "Normativa y métodos constructivos",
    specialty: "Normativa, diseño y procedimientos de construcción",
    query: "manual técnico especificaciones norma método diseño construcción edificios puentes carreteras infraestructura civil building codes standards technical manuals bridge road infrastructure structural design",
    focus: "manuales, normas y procedimientos técnicos de obra"
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

function selectSearchPlan(now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  const slot = Math.floor(safeTimestamp / (30 * 60 * 1000));
  return SEARCH_PLANS[((slot % SEARCH_PLANS.length) + SEARCH_PLANS.length) % SEARCH_PLANS.length];
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

      const plan = input.plan || selectSearchPlan(input.now);
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
        topic: String(lead.title).trim().slice(0, 180),
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
