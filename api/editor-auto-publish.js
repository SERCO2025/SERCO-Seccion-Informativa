"use strict";

const { createTavilySearchProvider } = require("../src/services/research/tavily-search-provider");
const { createSequentialResearchProvider } = require("../src/services/research/sequential-research-provider");
const { createArticlePersistence } = require("../src/services/editor/article-persistence");
const { getCitationOrder } = require("../src/services/research/citation-order");

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_TOKEN = process.env.SERCO_AUTO_PUBLISH_TOKEN || "";
const AUTOMATION_GEMINI_API_KEY = process.env.GEMINI_AUTOMATION_API_KEY || "";
const HAS_AI_PROVIDER = Boolean(
  AUTOMATION_GEMINI_API_KEY ||
  process.env.GROQ_API_KEY ||
  (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN)
);
const SEARCH = createTavilySearchProvider({ maxResults: 8 });
const CONSTRUCTION_SEARCH = createConstructionSearchProvider(SEARCH);
const RESEARCH = createSequentialResearchProvider({
  searchProvider: CONSTRUCTION_SEARCH,
  geminiApiKey: AUTOMATION_GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_AUTOMATION_MODEL || process.env.GEMINI_RESEARCH_MODEL || undefined,
  timeoutMs: 12000
});
const PERSISTENCE = createArticlePersistence();

const TOPICS = [
  ["Cemento Portland", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Tipos de cemento y sus aplicaciones", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Concreto u hormigón hidráulico", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Relación agua-cemento", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Agregados para concreto", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Granulometría de arena y grava", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Aditivos para concreto", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Mortero de albañilería", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Cal hidratada en construcción", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Yeso para construcción", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Acero de refuerzo para concreto", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Acero estructural", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Mampostería de ladrillo y bloque", "Sistemas constructivos", "Sistemas constructivos y ejecución de obra"],
  ["Impermeabilización de cimentaciones y cubiertas", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Aislamiento térmico en edificaciones", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Aislamiento acústico en edificaciones", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Materiales geosintéticos en obra civil", "Materiales de construcción", "Materiales, ensayos y tecnología de construcción"],
  ["Mezclas asfálticas para pavimentos", "Infraestructura vial", "Carreteras, pavimentos y transporte"],
  ["Estudio geotécnico del terreno", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Mecánica de suelos", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Capacidad portante del suelo", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Compactación de suelos", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Ensayo Proctor de compactación", "Laboratorio y control de calidad", "Ensayos, normas y control de calidad"],
  ["Valor relativo de soporte CBR", "Laboratorio y control de calidad", "Ensayos, normas y control de calidad"],
  ["Nivel freático y excavaciones", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Cimentaciones superficiales", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Cimentaciones profundas y pilotes", "Geotecnia y cimentaciones", "Mecánica de suelos, geotecnia y cimentaciones"],
  ["Levantamiento topográfico de terrenos", "Topografía y cartografía", "Topografía, medición y replanteo"],
  ["Deslinde y delimitación topográfica de predios", "Topografía y cartografía", "Topografía, medición y replanteo"],
  ["Curvas de nivel y configuración del terreno", "Topografía y cartografía", "Topografía, medición y replanteo"],
  ["Replanteo topográfico de obras", "Topografía y cartografía", "Topografía, medición y replanteo"],
  ["Estación total en levantamientos de obra", "Topografía y cartografía", "Topografía, medición y replanteo"],
  ["Cargas y acciones en estructuras", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Análisis estructural de edificaciones", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Concreto reforzado en estructuras", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Diseño de elementos de concreto armado", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Conexiones en estructuras de acero", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Soldadura en estructuras metálicas de construcción", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Muros de contención", "Ingeniería estructural", "Diseño, análisis y construcción estructural"],
  ["Losas de entrepiso y azotea", "Sistemas constructivos", "Sistemas constructivos y ejecución de obra"],
  ["Escaleras de concreto en edificaciones", "Sistemas constructivos", "Sistemas constructivos y ejecución de obra"],
  ["Pavimento flexible", "Infraestructura vial", "Carreteras, pavimentos y transporte"],
  ["Pavimento rígido de concreto", "Infraestructura vial", "Carreteras, pavimentos y transporte"],
  ["Subbase y base hidráulica de pavimentos", "Infraestructura vial", "Carreteras, pavimentos y transporte"],
  ["Drenaje pluvial en carreteras", "Infraestructura vial", "Carreteras, pavimentos y transporte"],
  ["Diseño y componentes de puentes", "Puentes y estructuras especiales", "Puentes, túneles y obras especiales"],
  ["Juntas de expansión en puentes", "Puentes y estructuras especiales", "Puentes, túneles y obras especiales"],
  ["Cimentación y pilas de puentes", "Puentes y estructuras especiales", "Puentes, túneles y obras especiales"],
  ["Pasos a desnivel e intersecciones a distinto nivel", "Infraestructura vial", "Carreteras, pavimentos y transporte"],
  ["Túneles y sostenimiento de excavaciones", "Puentes y estructuras especiales", "Puentes, túneles y obras especiales"],
  ["Instalaciones hidrosanitarias en edificaciones", "Instalaciones de edificios", "Instalaciones y desempeño de edificaciones"],
  ["Instalaciones eléctricas en edificaciones", "Instalaciones de edificios", "Instalaciones y desempeño de edificaciones"],
  ["Ventilación y climatización de edificios", "Instalaciones de edificios", "Instalaciones y desempeño de edificaciones"],
  ["Protección contra incendios en edificaciones", "Instalaciones de edificios", "Instalaciones y desempeño de edificaciones"],
  ["Accesibilidad y diseño universal en edificios", "Arquitectura y edificación", "Arquitectura, habitabilidad y edificación"],
  ["Aislamiento y eficiencia energética de edificios", "Arquitectura y edificación", "Arquitectura, habitabilidad y edificación"],
  ["Códigos y reglamentos de construcción", "Normativa y seguridad de obra", "Normativa, seguridad y gestión de obra"],
  ["Seguridad en excavaciones y zanjas", "Normativa y seguridad de obra", "Normativa, seguridad y gestión de obra"],
  ["Seguridad en trabajos en altura en construcción", "Normativa y seguridad de obra", "Normativa, seguridad y gestión de obra"],
  ["Control de calidad del concreto en obra", "Laboratorio y control de calidad", "Ensayos, normas y control de calidad"],
  ["Ensayo de revenimiento del concreto", "Laboratorio y control de calidad", "Ensayos, normas y control de calidad"],
  ["Resistencia a compresión del concreto", "Laboratorio y control de calidad", "Ensayos, normas y control de calidad"],
  ["Pruebas de compactación en campo", "Laboratorio y control de calidad", "Ensayos, normas y control de calidad"],
  ["Cuantificación de volúmenes de obra", "Costos y presupuestos", "Medición, costos y administración de obra"],
  ["Análisis de precios unitarios de construcción", "Costos y presupuestos", "Medición, costos y administración de obra"],
  ["Presupuesto de obra y catálogo de conceptos", "Costos y presupuestos", "Medición, costos y administración de obra"],
  ["Estimación de costos directos e indirectos", "Costos y presupuestos", "Medición, costos y administración de obra"],
  ["Programación y ruta crítica de obra", "Planeación y administración de obra", "Medición, costos y administración de obra"],
  ["Movimiento de tierras y cálculo de volúmenes", "Ejecución de obra", "Sistemas constructivos y ejecución de obra"]
];


const LOW_CREDIBILITY_HOSTS = Object.freeze([
  "facebook.com", "instagram.com", "tiktok.com", "pinterest.com",
  "quora.com", "reddit.com", "x.com", "twitter.com", "threads.net"
]);

function isSeriousConstructionSourceCandidate(source) {
  if (!source || typeof source.url !== "string" || typeof source.title !== "string") return false;
  let hostname;
  try {
    const parsed = new URL(source.url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
    hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (LOW_CREDIBILITY_HOSTS.some((domain) => hostname === domain || hostname.endsWith("." + domain))) {
    return false;
  }
  const title = source.title.trim();
  const evidenceText = String(source.content || source.rawContent || source.snippet || source.excerpt || "").trim();
  return title.length >= 3 && evidenceText.length >= 40;
}

function createConstructionSearchProvider(provider) {
  return {
    async search(input) {
      const result = await provider.search(input);
      const candidateResults = (Array.isArray(result.results) ? result.results : [])
        .filter(isSeriousConstructionSourceCandidate);
      if (candidateResults.length < 2) {
        const error = new Error("La investigación de construcción no reunió al menos dos fuentes HTTPS con contenido técnico suficiente para evaluar.");
        error.code = "INSUFFICIENT_CONSTRUCTION_SOURCE_CANDIDATES";
        throw error;
      }
      return Object.assign({}, result, {
        results: candidateResults,
        resultCount: candidateResults.length
      });
    },
    async extract(input) {
      if (typeof provider.extract !== "function") {
        return { provider: "tavily", results: [], resultCount: 0, enabled: false };
      }
      return provider.extract(input);
    }
  };
}

function selectPendingTopic(topics, existingTitles, now = new Date()) {
  const available = Array.isArray(topics) ? topics : [];
  const titles = existingTitles instanceof Set ? existingTitles : new Set();
  if (!available.length) return null;
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  const slot = Math.floor(safeTimestamp / (20 * 60 * 1000));
  const start = ((slot % available.length) + available.length) % available.length;
  for (let offset = 0; offset < available.length; offset += 1) {
    const topic = available[(start + offset) % available.length];
    const title = ("Diccionario técnico: " + topic[0]).toLowerCase();
    if (!titles.has(title)) return topic;
  }
  return null;
}

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
}
function reportToHtml(report) {
  const lines = String(report || "").split(/\r?\n/);
  const out = [];
  let list = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (list) { out.push("</ul>"); list = false; } continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (heading) { if (list) { out.push("</ul>"); list = false; } const level = Math.min(4, heading[1].length + 1); out.push("<h" + level + ">" + escapeHtml(heading[2]) + "</h" + level + ">"); }
    else if (bullet) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + escapeHtml(bullet[1]) + "</li>"); }
    else { if (list) { out.push("</ul>"); list = false; } out.push("<p>" + escapeHtml(line) + "</p>"); }
  }
  if (list) out.push("</ul>");
  return out.join("\n");
}
function plainText(report) {
  return String(report || "").replace(/[#*_`>]/g, " ").replace(/\s+/g, " ").trim();
}
function summary(report) {
  return plainText(report).split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 650);
}
async function supabaseRest(path) {
  const headers = { apikey: SECRET_KEY };
  if (!SECRET_KEY.startsWith("sb_secret_")) headers.Authorization = "Bearer " + SECRET_KEY;
  const response = await fetch(BASE + path, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("CATALOG_HTTP_" + response.status + ": " + String(payload && (payload.message || payload.details || payload.hint || payload.code) || "Respuesta no disponible"));
  return payload;
}
async function generate(topic, index, batchId) {
  const query = [
    "Investigación especializada de ingeniería civil, arquitectura y construcción de obras e infraestructura.",
    topic[0] + " definición técnica, fundamentos, clasificación, aplicaciones en edificaciones u obra civil, especificaciones, métodos de ejecución, ensayos, control de calidad, seguridad y normativa aplicable.",
    "Evalúa la seriedad de cada fuente por su contenido y respaldo, no por la extensión de su dominio. Puedes utilizar universidades, organismos públicos, normas y entidades técnicas, laboratorios, fabricantes, constructoras, despachos profesionales, ingenieros, arquitectos, especialistas y publicaciones privadas cuando aporten documentación verificable, autoría o responsabilidad identificable, datos, metodología, especificaciones, ensayos, referencias o experiencia técnica demostrable.",
    "Contrasta las afirmaciones importantes con fuentes independientes cuando sea posible. Distingue hechos medidos, requisitos normativos, recomendaciones del fabricante y opiniones. Comprueba fecha, versión, país y jurisdicción de normas o especificaciones. No inventes autores, ensayos, cifras, normas ni referencias.",
    "Descarta contenido sin fundamento técnico, afirmaciones promocionales presentadas como hechos, publicaciones anónimas sin evidencia, foros y contenido esotérico. Un dominio .com, un blog o una fuente privada no son motivo suficiente para descartarlos: evalúa su contenido y respaldo real.",
    "Desarrolla una entrada técnica de diccionario en español y distingue normas o requisitos según país y jurisdicción."
  ].join(" ");
  const result = await RESEARCH.research({ query });
  if (result.status !== "completed" || !result.expandedAnswer || !result.internalReport) {
    const attempts = Array.isArray(result.providerAttempts) ? result.providerAttempts : [];
    const failedProviders = attempts.map((item) => item.provider + ":" + item.code).join(",");
    const unavailable = new Error("No hay proveedor de IA disponible para generar " + topic[0] + (failedProviders ? " (" + failedProviders + ")" : "") + ".");
    unavailable.code = "AI_PROVIDERS_UNAVAILABLE";
    throw unavailable;
  }
  const sources = (result.sources || []).filter((s) => s && s.title && isSeriousConstructionSourceCandidate(s)).slice(0, 8).map((s, index) => ({
    title: s.title, source_type: "website", source_url: s.url,
    published_date: /^\d{4}-\d{2}-\d{2}$/.test(String(s.publishedDate || "")) ? s.publishedDate : null,
    metadata: { provider: "Tavily", score: s.score || null, citation_order: getCitationOrder(s, index) }
  }));
  if (sources.length < 2) throw new Error("La investigación de " + topic[0] + " no reunió al menos dos fuentes verificables.");
  const body = String(result.expandedAnswer || "").trim();
  const internalReport = String(result.internalReport || "").trim();
  if (body.length < 1200) throw new Error("La explicación pública de " + topic[0] + " no alcanzó la extensión mínima de calidad.");
  if (internalReport.length < 1200) throw new Error("El expediente interno de " + topic[0] + " no alcanzó la extensión mínima de calidad.");
  const title = "Diccionario técnico: " + topic[0];
  const summaryText = summary(body);
  if (summaryText.length < 30) throw new Error("No se pudo generar un resumen suficiente para " + topic[0] + ".");
  const document = {
    title, slug: "diccionario-" + topic[0].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""),
    summary: summaryText, content_type: "dictionary_entry", status: "published",
    author_name: "SERCO · Diccionario técnico automatizado", origin: "ai_research",
    specialty: topic[2], categories: ["Diccionario técnico", topic[1], topic[2]],
    tags: ["diccionario", "definiciones técnicas", "SERCO", topic[1].toLowerCase()],
    content_html: reportToHtml(body), content_text: body, sources, assets: [], relations: [],
    featured: false, ai_retrieval_enabled: true,
    search_metadata: { title, description: summaryText, concepts: [topic[0], topic[1], topic[2]] },
    editorial_metadata: {
      provider: result.provider, model: result.model, research_date: new Date().toISOString(),
      external_research: true, automated_dictionary: true, automation_batch: batchId,
      sequence_in_batch: index + 1, source_count: sources.length,
      editorial_note: "Contenido público generado a partir de investigación externa y fuentes registradas. Verificar jurisdicción, vigencia y aplicación específica al revisar.",
      internal_research_report: internalReport,
      claim_evidence_index: {
        method: result.claimEvidenceMethod,
        independently_verified: false,
        items: result.claimEvidence
      }
    }
  };
  const saved = await PERSISTENCE.save({ document });
  return { title, public_id: saved.saved.public_id, article_id: saved.saved.article_id, sources: sources.length, chunks: saved.chunk_count };
}
module.exports = async function automaticEditorialPublisher(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "METHOD_NOT_ALLOWED" }); }
  if (!BASE || !SECRET_KEY || !HAS_AI_PROVIDER || !process.env.TAVILY_API_KEY || !CRON_TOKEN) {
    return send(res, 503, { error: "AUTO_PUBLISH_NOT_CONFIGURED" });
  }
  const auth = String(req.headers && req.headers.authorization || "");
  if (auth !== "Bearer " + CRON_TOKEN) return send(res, 401, { error: "UNAUTHORIZED" });
  try {
    const existing = await supabaseRest("/rest/v1/articles?select=title&origin=eq.ai_research&content_type=eq.dictionary_entry&limit=1000");
    const titles = new Set((existing || []).map((a) => String(a.title || "").toLowerCase()));
    const topic = selectPendingTopic(TOPICS, titles, new Date());
    if (!topic) return send(res, 409, { error: "TOPIC_QUEUE_EXHAUSTED", remaining: 0 });
    const batchId = new Date().toISOString().replace(/[:.]/g, "-");
    const results = [await generate(topic, 0, batchId)];
    return send(res, 200, { success: true, generated: results.length, batch_id: batchId, publications: results });
  } catch (error) {
    const unavailable = error && error.code === "AI_PROVIDERS_UNAVAILABLE";
    return send(res, unavailable ? 503 : 502, {
      error: unavailable ? "AI_PROVIDERS_UNAVAILABLE" : "AUTO_PUBLISH_FAILED",
      message: String(error && error.message || "Error desconocido")
    });
  }
};
module.exports.config = { maxDuration: 60 };
module.exports.selectPendingTopic = selectPendingTopic;
module.exports.isSeriousConstructionSourceCandidate = isSeriousConstructionSourceCandidate;
module.exports.createConstructionSearchProvider = createConstructionSearchProvider;
module.exports.TOPICS = TOPICS;
