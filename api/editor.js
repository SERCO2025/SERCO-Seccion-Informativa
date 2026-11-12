"use strict";

const { randomUUID } = require("node:crypto");
const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAIL = (process.env.SERCO_ADMIN_EMAIL || "").trim().toLowerCase();
const MAX_BODY_BYTES = 900000;

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}
function parseBody(req) {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { throw new Error("JSON_INVALID"); }
  }
  if (req.body && typeof req.body === "object") return req.body;
  return {};
}
function stripHtml(value) {
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}
function sanitizeHtml(html) {
  let value = String(html || "").slice(0, 500000);
  value = value.replace(/<(script|style|iframe|object|embed|form|input|button|meta|link)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  value = value.replace(/<(script|style|iframe|object|embed|form|input|button|meta|link)\b[^>]*\/?>/gi, "");
  value = value.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  value = value.replace(/\s+(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, "");
  return value;
}
function makeChunks(html, text) {
  const parts = [];
  const source = String(html || "");
  const matches = source.match(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>|<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi) || [];
  let current = { heading: null, content: "" };
  const flush = () => {
    const content = current.content.trim();
    if (content) parts.push({ chunk_index: parts.length, heading: current.heading, content, metadata: {} });
    current = { heading: null, content: "" };
  };
  for (const fragment of matches) {
    const headingMatch = fragment.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>$/i);
    if (headingMatch) {
      flush();
      current.heading = stripHtml(headingMatch[1]);
      continue;
    }
    const plain = stripHtml(fragment);
    if (!plain) continue;
    if ((current.content.length + plain.length) > 1600) flush();
    current.content += (current.content ? "\n\n" : "") + plain;
  }
  flush();
  if (!parts.length && text) {
    for (let i = 0; i < text.length; i += 1400) {
      parts.push({ chunk_index: parts.length, heading: null, content: text.slice(i, i + 1400), metadata: {} });
    }
  }
  return parts;
}
async function adminFromRequest(req) {
  const authorization = req.headers && req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const response = await fetch(BASE + "/auth/v1/user", {
    headers: { apikey: PUBLIC_KEY, Authorization: "Bearer " + token }
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user.id || String(user.email || "").toLowerCase() !== ADMIN_EMAIL) return null;
  return user;
}
async function supabaseRest(path, options = {}) {
  const response = await fetch(BASE + path, {
    method: options.method || "GET",
    headers: {
      apikey: SECRET_KEY,
      Authorization: "Bearer " + SECRET_KEY,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload && (payload.message || payload.details || payload.hint) || "Supabase request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}
module.exports = async function editorApi(req, res) {
  if (!BASE || !PUBLIC_KEY || !SECRET_KEY || !ADMIN_EMAIL) {
    return send(res, 503, { error: { code: "EDITOR_BACKEND_NOT_CONFIGURED", message: "El editor necesita SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY y SERCO_ADMIN_EMAIL en el servidor." } });
  }
  let user;
  try { user = await adminFromRequest(req); } catch { return send(res, 502, { error: { code: "AUTH_UNAVAILABLE", message: "No fue posible verificar la sesión." } }); }
  if (!user) return send(res, 401, { error: { code: "UNAUTHORIZED", message: "Se requiere una sesión administrativa válida." } });
  try {
    if (req.method === "GET") {
      const id = typeof req.query?.id === "string" ? req.query.id : "";
      if (id) {
        const articles = await supabaseRest("/rest/v1/articles?select=*&id=eq." + encodeURIComponent(id) + "&limit=1");
        if (!articles.length) return send(res, 404, { error: { code: "NOT_FOUND", message: "No se encontró la publicación." } });
        const article = articles[0];
        const [versions,sources,assets,categories,tags,relations] = await Promise.all([
          supabaseRest("/rest/v1/article_versions?select=*&article_id=eq." + article.id + "&order=version_number.desc"),
          supabaseRest("/rest/v1/article_sources?select=*&article_id=eq." + article.id),
          supabaseRest("/rest/v1/article_assets?select=*&article_id=eq." + article.id),
          supabaseRest("/rest/v1/article_categories?select=category:categories(*)&article_id=eq." + article.id),
          supabaseRest("/rest/v1/article_tags?select=tag:tags(*)&article_id=eq." + article.id),
          supabaseRest("/rest/v1/article_relations?select=relation_type,related:articles!article_relations_related_article_id_fkey(public_id,title)&article_id=eq." + article.id)
        ]);
        return send(res,200,{article,versions,sources,assets,categories:categories.map(x=>x.category),tags:tags.map(x=>x.tag),relations});
      }
      const articles = await supabaseRest("/rest/v1/articles?select=id,public_id,slug,title,summary,status,content_type,author_name,origin,specialty,featured,ai_retrieval_enabled,created_at,updated_at,published_version_id&order=updated_at.desc&limit=100");
      return send(res,200,{articles});
    }
    if (req.method === "POST") {
      const body = parseBody(req);
      if (body.action === "reserve") {
        const articleId = String(body.article_id || "");
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(articleId)) {
          return send(res, 400, { error: { code: "INVALID_ARTICLE_ID", message: "Identificador interno no válido." } });
        }
        const title = String(body.title || "").trim();
        const summary = String(body.summary || "").trim();
        if (title.length < 5 || summary.length < 30) {
          return send(res, 422, { error: { code: "VALIDATION_ERROR", message: "Completa título y resumen antes de preparar los archivos." } });
        }
        const slug = title.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + articleId.slice(0, 8);
        const reserved = await supabaseRest("/rest/v1/articles", {
          method: "POST",
          body: { id: articleId, slug, title, summary, content_type: body.content_type || "article", status: "draft",
            author_name: String(body.author_name || "").trim(), origin: body.origin || "manual",
            specialty: body.specialty || null, featured: !!body.featured,
            ai_retrieval_enabled: body.ai_retrieval_enabled !== false }
        });
        return send(res, 200, { article: Array.isArray(reserved) ? reserved[0] : reserved });
      }
      const document = body.document;
      if (!document || typeof document !== "object") return send(res,400,{error:{code:"INVALID_DOCUMENT",message:"Falta el documento editorial."}});
      const contentHtml = sanitizeHtml(document.content_html || "");
      const contentText = stripHtml(contentHtml);
      let stableSlug = String(document.slug || "").trim();
      if (!stableSlug) {
        if (body.article_id) {
          const current = await supabaseRest("/rest/v1/articles?select=slug&id=eq." + encodeURIComponent(body.article_id) + "&limit=1");
          stableSlug = current[0]?.slug || "";
        }
        if (!stableSlug) {
          stableSlug = String(document.title || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + randomUUID().slice(0, 8);
        }
      }
      const normalized = {
        ...document,
        slug: stableSlug,
        content_html: contentHtml,
        content_text: contentText,
        author_name: String(document.author_name || document.author || "").trim(),
        ai_retrieval_enabled: document.ai_retrieval_enabled !== false && document.include_in_knowledge !== false,
        created_by: user.id,
        sources: Array.isArray(document.sources) ? document.sources.map(s=>({
          title:String(s.title||"").trim(),source_type:s.source_type||s.type||"website",
          source_url:String(s.source_url||s.url||"").trim(),author:s.author||null,
          published_date:s.published_date||s.date||null,metadata:{}
        })) : [],
        assets: Array.isArray(document.assets) ? document.assets : [],
        categories: Array.isArray(document.categories) ? document.categories : [],
        tags: Array.isArray(document.tags) ? document.tags : [],
        relations: Array.isArray(document.relations) ? document.relations : [],
        search_metadata: {
          title: document.search_title || "",
          description: document.search_description || "",
          synonyms: document.synonyms || [],
          concepts: document.concepts || []
        }
      };
      const chunks = makeChunks(contentHtml,contentText);
      const saved = await supabaseRest("/rest/v1/rpc/save_article_bundle",{
        method:"POST",prefer:"return=representation",
        body:{p_article_id:body.article_id||null,p_document:normalized,p_chunks:chunks}
      });
      return send(res,200,{saved,chunk_count:chunks.length});
    }
    res.setHeader("Allow","GET, POST");
    return send(res,405,{error:{code:"METHOD_NOT_ALLOWED",message:"Usa GET o POST."}});
  } catch(error) {
    const message=String(error.message||"");
    const validation=message.includes("VALIDATION:");
    const notFound=message.includes("NOT_FOUND:");
    return send(res,validation?422:notFound?404:error.status||500,{
      error:{code:validation?"VALIDATION_ERROR":notFound?"NOT_FOUND":"EDITOR_SAVE_FAILED",
        message:validation||notFound?message.split(":").slice(1).join(":").trim():"No fue posible completar la operación editorial."}
    });
  }
};
