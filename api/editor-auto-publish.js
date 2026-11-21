"use strict";

const { createTavilySearchProvider } = require("../src/services/research/tavily-search-provider");
const { createGeminiResearchProvider } = require("../src/services/research/gemini-research-provider");
const { createArticlePersistence } = require("../src/services/editor/article-persistence");

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CRON_TOKEN = process.env.SERCO_AUTO_PUBLISH_TOKEN || "";
const AUTOMATION_GEMINI_API_KEY = process.env.GEMINI_AUTOMATION_API_KEY || "";
const SEARCH = createTavilySearchProvider({ maxResults: 8 });
const RESEARCH = createGeminiResearchProvider({
  searchProvider: SEARCH,
  apiKey: AUTOMATION_GEMINI_API_KEY,
  requestTimeoutMs: 18000,
  maxRetryDelayMs: 2000
});
const PERSISTENCE = createArticlePersistence();

const TOPICS = [
  ["Material de trabajo","Materiales e insumos","Conceptos generales de materiales"],
  ["Materia prima","Materiales e insumos","Conceptos generales de materiales"],
  ["Insumo","Materiales e insumos","Conceptos generales de materiales"],
  ["Consumible","Materiales e insumos","Conceptos generales de materiales"],
  ["Equipo de trabajo","Herramientas y equipos","Herramientas, equipos y seguridad en el trabajo"],
  ["Máquina herramienta","Herramientas y equipos","Herramientas, equipos y seguridad en el trabajo"],
  ["Instrumento de medición","Metrología y control","Metrología y control de calidad"],
  ["Calibración","Metrología y control","Metrología y control de calidad"],
  ["Tolerancia dimensional","Metrología y control","Metrología y control de calidad"],
  ["Precisión y exactitud","Metrología y control","Metrología y control de calidad"],
  ["Mantenimiento preventivo","Mantenimiento","Mantenimiento y operación"],
  ["Mantenimiento correctivo","Mantenimiento","Mantenimiento y operación"],
  ["Orden y limpieza en el trabajo","Seguridad y salud en el trabajo","Seguridad y salud en el trabajo"],
  ["Evaluación de riesgos laborales","Seguridad y salud en el trabajo","Seguridad y salud en el trabajo"],
  ["Hoja de datos de seguridad","Materiales e insumos","Materiales e insumos"],
  ["Ficha técnica de producto","Materiales e insumos","Materiales e insumos"],
  ["Adhesivo industrial","Materiales e insumos","Materiales e insumos"],
  ["Solvente","Materiales e insumos","Materiales e insumos"],
  ["Pintura y recubrimiento","Acabados y recubrimientos","Acabados y recubrimientos"],
  ["Abrasivo","Materiales e insumos","Materiales e insumos"],
  ["Disco abrasivo","Herramientas y equipos","Herramientas, equipos y seguridad en el trabajo"],
  ["Electrodo revestido","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Alambre para soldadura MIG/MAG","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Gas de protección para soldadura","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Proceso SMAW","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Proceso GMAW","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Proceso GTAW","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Cordón de soldadura","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Zona afectada por el calor","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Metal base y metal de aporte","Soldadura","Soldadura y procesos metalmecánicos"],
  ["Vinil de corte","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Vinil de rotulación","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Cinta de transferencia","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Sustrato para impresión","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Laminado de protección","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Adhesión y adherencia","Materiales e insumos","Materiales e insumos"],
  ["Desengrase de superficies","Preparación de superficies","Acabados y recubrimientos"],
  ["Pulido","Preparación de superficies","Acabados y recubrimientos"],
  ["Lijado","Preparación de superficies","Acabados y recubrimientos"],
  ["Imprimación o primer","Acabados y recubrimientos","Acabados y recubrimientos"],
  ["Barniz","Acabados y recubrimientos","Acabados y recubrimientos"],
  ["Masilla de carrocería","Acabados y recubrimientos","Acabados y recubrimientos"],
  ["Pistola de pintura","Herramientas y equipos","Herramientas, equipos y seguridad en el trabajo"],
  ["Compresor de aire","Herramientas y equipos","Herramientas, equipos y seguridad en el trabajo"],
  ["Presión y caudal","Conceptos técnicos","Conceptos generales de materiales"],
  ["Circuito eléctrico","Electricidad y electrónica","Electricidad y electrónica"],
  ["Tensión o voltaje","Electricidad y electrónica","Electricidad y electrónica"],
  ["Corriente eléctrica","Electricidad y electrónica","Electricidad y electrónica"],
  ["Resistencia eléctrica","Electricidad y electrónica","Electricidad y electrónica"],
  ["Potencia eléctrica","Electricidad y electrónica","Electricidad y electrónica"],
  ["Continuidad eléctrica","Electricidad y electrónica","Electricidad y electrónica"],
  ["Multímetro","Electricidad y electrónica","Electricidad y electrónica"],
  ["Conductor eléctrico","Electricidad y electrónica","Electricidad y electrónica"],
  ["Aislamiento eléctrico","Electricidad y electrónica","Electricidad y electrónica"],
  ["Puesta a tierra","Electricidad y electrónica","Electricidad y electrónica"],
  ["Fusible y protección contra sobrecorriente","Electricidad y electrónica","Electricidad y electrónica"],
  ["Relé electromecánico","Electricidad y electrónica","Electricidad y electrónica"],
  ["Sensor y actuador","Electricidad y electrónica","Electricidad y electrónica"],
  ["Motor eléctrico","Electricidad y electrónica","Electricidad y electrónica"],
  ["Transformador eléctrico","Electricidad y electrónica","Electricidad y electrónica"],
  ["Batería recargable","Electricidad y electrónica","Electricidad y electrónica"],
  ["Calibre de conductor","Electricidad y electrónica","Electricidad y electrónica"],
  ["Frecuencia de audio","Audio y producción musical","Audio y producción musical"],
  ["Decibelio","Audio y producción musical","Audio y producción musical"],
  ["Ganancia de audio","Audio y producción musical","Audio y producción musical"],
  ["Ecualización","Audio y producción musical","Audio y producción musical"],
  ["Compresión de audio","Audio y producción musical","Audio y producción musical"],
  ["Interfaz de audio","Audio y producción musical","Audio y producción musical"],
  ["Micrófono","Audio y producción musical","Audio y producción musical"],
  ["Impedancia","Audio y producción musical","Audio y producción musical"],
  ["Acústica","Audio y producción musical","Audio y producción musical"],
  ["Reverberación","Audio y producción musical","Audio y producción musical"],
  ["Mezcla de audio","Audio y producción musical","Audio y producción musical"],
  ["Masterización","Audio y producción musical","Audio y producción musical"],
  ["Formato vectorial","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Resolución de imagen","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["DPI y PPI","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Modelos de color RGB y CMYK","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Tipografía","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Identidad corporativa","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Logotipo","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Retícula de diseño","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Sangrado de impresión","Diseño gráfico","Diseño gráfico, impresión y rotulación"],
  ["Plotter de corte","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Cuchilla para plotter","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Aplicación de vinil en seco y en húmedo","Rotulación y gráficos","Diseño gráfico, impresión y rotulación"],
  ["Traducción certificada","Traducción y documentación","Traducción y documentación"],
  ["Traducción literal y traducción funcional","Traducción y documentación","Traducción y documentación"],
  ["Fidelidad documental","Traducción y documentación","Traducción y documentación"],
  ["Transcripción documental","Traducción y documentación","Traducción y documentación"],
  ["Terminología jurídica","Traducción y documentación","Traducción y documentación"],
  ["Notario y función notarial","Traducción y documentación","Traducción y documentación"],
  ["Apostilla","Traducción y documentación","Traducción y documentación"],
  ["Acta de nacimiento","Traducción y documentación","Traducción y documentación"],
  ["Título de propiedad vehicular","Automoción y documentación","Automoción y documentación"],
  ["Número de identificación vehicular VIN","Automoción y documentación","Automoción y documentación"],
  ["Inspección precompra de automóvil","Automoción","Automoción y mantenimiento vehicular"],
  ["Kilometraje vehicular","Automoción","Automoción y mantenimiento vehicular"],
  ["Diagnóstico automotriz","Automoción","Automoción y mantenimiento vehicular"],
  ["Motor de combustión interna","Automoción","Automoción y mantenimiento vehicular"],
  ["Sistema de frenos","Automoción","Automoción y mantenimiento vehicular"],
  ["Neumático","Automoción","Automoción y mantenimiento vehicular"],
  ["Alineación y balanceo","Automoción","Automoción y mantenimiento vehicular"],
  ["Detalle automotriz","Cuidado y estética vehicular","Automoción y mantenimiento vehicular"],
  ["Descontaminación de pintura automotriz","Cuidado y estética vehicular","Automoción y mantenimiento vehicular"],
  ["Lavado exterior de vehículos","Cuidado y estética vehicular","Automoción y mantenimiento vehicular"],
  ["Pulido de carrocería","Cuidado y estética vehicular","Automoción y mantenimiento vehicular"],
  ["Gestión de residuos de taller","Seguridad y medio ambiente","Seguridad y salud en el trabajo"],
  ["Ergonomía laboral","Seguridad y salud en el trabajo","Seguridad y salud en el trabajo"],
  ["Calidad","Calidad y procesos","Calidad y procesos"],
  ["Control de calidad","Calidad y procesos","Calidad y procesos"],
  ["Procedimiento operativo estándar","Calidad y procesos","Calidad y procesos"],
  ["Orden de trabajo","Gestión de servicios","Gestión de servicios y operaciones"],
  ["Cotización y presupuesto","Gestión de servicios","Gestión de servicios y operaciones"],
  ["Inventario","Gestión de servicios","Gestión de servicios y operaciones"],
  ["Cadena de custodia documental","Traducción y documentación","Traducción y documentación"],
  ["Metadatos","Información y documentación","Información y documentación"],
  ["Derechos de autor","Información y documentación","Información y documentación"],
  ["Licencia de uso de imagen","Información y documentación","Información y documentación"],
  ["Fuente primaria","Información y documentación","Información y documentación"],
  ["Verificación de fuentes","Información y documentación","Información y documentación"],
  ["Búsqueda documental","Información y documentación","Información y documentación"],
  ["Base de conocimiento","Información y documentación","Información y documentación"],
  ["Fragmento de búsqueda","Información y documentación","Información y documentación"],
  ["Taxonomía documental","Información y documentación","Información y documentación"]
];

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
    topic[0] + " definición técnica, características, clasificación, usos, materiales o componentes, selección, operación, mantenimiento, riesgos y prevención.",
    "Prioriza normas, organismos oficiales, universidades y documentación técnica primaria.",
    "Explica el concepto desde nivel básico y desarrolla una entrada de diccionario técnico en español."
  ].join(" ");
  const result = await RESEARCH.research({ query });
  const sources = (result.sources || []).filter((s) => s && s.title && /^https?:\/\//i.test(s.url || "")).slice(0, 8).map((s) => ({
    title: s.title, source_type: "website", source_url: s.url,
    published_date: /^\d{4}-\d{2}-\d{2}$/.test(String(s.publishedDate || "")) ? s.publishedDate : null,
    metadata: { provider: "Tavily", score: s.score || null }
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
      internal_research_report: internalReport
    }
  };
  const saved = await PERSISTENCE.save({ document });
  return { title, public_id: saved.saved.public_id, article_id: saved.saved.article_id, sources: sources.length, chunks: saved.chunk_count };
}
module.exports = async function automaticEditorialPublisher(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "METHOD_NOT_ALLOWED" }); }
  if (!BASE || !SECRET_KEY || !AUTOMATION_GEMINI_API_KEY || !process.env.TAVILY_API_KEY || !CRON_TOKEN) {
    return send(res, 503, { error: "AUTO_PUBLISH_NOT_CONFIGURED" });
  }
  const auth = String(req.headers && req.headers.authorization || "");
  if (auth !== "Bearer " + CRON_TOKEN) return send(res, 401, { error: "UNAUTHORIZED" });
  try {
    const existing = await supabaseRest("/rest/v1/articles?select=title&origin=eq.ai_research&content_type=eq.dictionary_entry&limit=1000");
    const titles = new Set((existing || []).map((a) => String(a.title || "").toLowerCase()));
    const pending = TOPICS.filter((t) => !titles.has(("Diccionario técnico: " + t[0]).toLowerCase())).slice(0, 1);
    if (pending.length < 1) return send(res, 409, { error: "TOPIC_QUEUE_EXHAUSTED", remaining: pending.length });
    const batchId = new Date().toISOString().replace(/[:.]/g, "-");
    const results = [await generate(pending[0], 0, batchId)];
    return send(res, 200, { success: true, generated: results.length, batch_id: batchId, publications: results });
  } catch (error) {
    return send(res, 502, { error: "AUTO_PUBLISH_FAILED", message: String(error && error.message || "Error desconocido") });
  }
};
module.exports.config = { maxDuration: 60 };
