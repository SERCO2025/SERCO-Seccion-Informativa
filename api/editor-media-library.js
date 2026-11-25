"use strict";

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAIL = (process.env.SERCO_ADMIN_EMAIL || "").trim().toLowerCase();
const MAX_LIMIT = 100;
const APPROVED_RIGHTS = new Set(["verified", "permission_granted", "public_domain"]);
const RIGHTS = new Set(["unverified", "verified", "permission_granted", "public_domain", "restricted"]);

function send(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}
function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch {} }
  return {};
}
function encodedPath(value) {
  return String(value || "").split("/").map(encodeURIComponent).join("/");
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
async function rest(path, options = {}) {
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
async function signedUrl(item) {
  const path = encodedPath(item.storage_path);
  if (item.bucket_id === "serco-media") {
    return BASE + "/storage/v1/object/public/" + encodeURIComponent(item.bucket_id) + "/" + path;
  }
  const response = await fetch(BASE + "/storage/v1/object/sign/" + encodeURIComponent(item.bucket_id) + "/" + path, {
    method: "POST",
    headers: { apikey: SECRET_KEY, Authorization: "Bearer " + SECRET_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !(result.signedURL || result.signedUrl)) return null;
  const value = result.signedURL || result.signedUrl;
  return /^https?:\/\//i.test(value) ? value : BASE + "/storage/v1" + (value.startsWith("/") ? value : "/" + value);
}
async function withUrl(item) {
  return { ...item, signed_url: await signedUrl(item) };
}
function validHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}
module.exports = async function editorMediaLibrary(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Usa GET o POST." } });
  }
  if (!BASE || !PUBLIC_KEY || !SECRET_KEY || !ADMIN_EMAIL) {
    return send(res, 503, { error: { code: "EDITOR_BACKEND_NOT_CONFIGURED", message: "Falta configurar el backend editorial." } });
  }
  try {
    const user = await adminFromRequest(req);
    if (!user) return send(res, 401, { error: { code: "UNAUTHORIZED", message: "Se requiere una sesión administrativa válida." } });
    if (req.method === "GET") {
      const articleId = String(req.query?.article_id || "").trim();
      if (articleId) {
        const links = await rest("/rest/v1/article_asset_links?select=*,media_file:media_files(*)&article_id=eq." +
          encodeURIComponent(articleId) + "&order=section_key.asc,sort_order.asc");
        const enriched = await Promise.all(links.map(async (link) => ({
          ...link, media_file: link.media_file ? await withUrl(link.media_file) : null
        })));
        return send(res, 200, { links: enriched });
      }
      const search = String(req.query?.q || "").trim().slice(0, 100).replace(/[,*()]/g, " ");
      const rights = String(req.query?.rights_status || "").trim();
      const limit = Math.max(1, Math.min(MAX_LIMIT, Number(req.query?.limit) || 60));
      let path = "/rest/v1/media_files?select=*&order=created_at.desc&limit=" + limit;
      if (RIGHTS.has(rights)) path += "&rights_status=eq." + encodeURIComponent(rights);
      if (search) {
        const pattern = "*" + search + "*";
        path += "&or=" + encodeURIComponent("(original_name.ilike." + pattern + ",description.ilike." + pattern + ",category.ilike." + pattern + ")");
      }
      const items = await rest(path);
      return send(res, 200, { items: await Promise.all(items.map(withUrl)) });
    }

    const body = bodyOf(req);
    if (body.action === "register") {
      const bucketId = String(body.bucket_id || "");
      const storagePath = String(body.storage_path || "");
      const originalName = String(body.original_name || "").trim();
      const mimeType = String(body.mime_type || "").trim().toLowerCase();
      const sizeBytes = Number(body.size_bytes || 0);
      if (bucketId !== "serco-publicaciones" || !storagePath.startsWith("biblioteca/") ||
          storagePath.includes("..") || !originalName || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > 25 * 1024 * 1024) {
        return send(res, 422, { error: { code: "INVALID_LIBRARY_FILE", message: "El archivo no corresponde a una carga válida de la biblioteca." } });
      }
      const rows = await rest("/rest/v1/media_files", {
        method: "POST",
        body: {
          bucket_id: bucketId, storage_path: storagePath, original_name: originalName,
          mime_type: mimeType || null, size_bytes: sizeBytes,
          media_type: mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "document",
          alt_text: String(body.alt_text || "").trim() || null,
          description: String(body.description || "").trim() || null,
          source_url: validHttpUrl(body.source_url) ? String(body.source_url).trim() : null,
          author: String(body.author || "").trim() || null,
          license: String(body.license || "").trim() || null,
          keywords: Array.isArray(body.keywords) ? body.keywords.map(String).map(x => x.trim()).filter(Boolean) : [],
          category: String(body.category || "").trim() || null,
          captured_at: body.captured_at || null,
          rights_status: "unverified",
          metadata: { registered_by: user.id, provenance_review_required: true }
        }
      });
      return send(res, 201, { item: rows[0] || rows, rights_status: "unverified" });
    }

    if (body.action === "review") {
      const id = String(body.media_file_id || "").trim();
      const rightsStatus = String(body.rights_status || "unverified");
      const sourceUrl = String(body.source_url || "").trim();
      const license = String(body.license || "").trim();
      const altText = String(body.alt_text || "").trim();
      const description = String(body.description || "").trim();
      const keywords = Array.isArray(body.keywords) ? body.keywords.map(String).map(x => x.trim()).filter(Boolean) : [];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !RIGHTS.has(rightsStatus) ||
          (APPROVED_RIGHTS.has(rightsStatus) && (!validHttpUrl(sourceUrl) || !license || !altText || !description || !keywords.length))) {
        return send(res, 422, { error: { code: "INVALID_RIGHTS_REVIEW", message: "Para autorizar un recurso se requieren procedencia HTTP/HTTPS, licencia o permiso, texto alternativo, descripción y palabras clave." } });
      }
      if (!APPROVED_RIGHTS.has(rightsStatus)) {
        const links = await rest("/rest/v1/article_asset_links?select=id&media_file_id=eq." + encodeURIComponent(id) + "&limit=1");
        if (links.length) return send(res, 409, { error: { code: "MEDIA_STILL_LINKED", message: "Primero retira este recurso de las publicaciones que lo utilizan." } });
      }
      const rows = await rest("/rest/v1/media_files?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        body: {
          rights_status: rightsStatus,
          source_url: sourceUrl || null,
          license: license || null,
          author: String(body.author || "").trim() || null,
          alt_text: altText || null,
          description: description || null,
          keywords,
          category: String(body.category || "").trim() || null,
          captured_at: body.captured_at || null
        }
      });
      return send(res, 200, { item: rows[0] || null });
    }

    if (body.action === "replace_links") {
      const articleId = String(body.article_id || "").trim();
      const links = Array.isArray(body.links) ? body.links : [];
      const result = await rest("/rest/v1/rpc/replace_article_asset_links", {
        method: "POST",
        body: { p_article_id: articleId, p_links: links }
      });
      return send(res, 200, result);
    }

    return send(res, 400, { error: { code: "INVALID_ACTION", message: "Acción de biblioteca no reconocida." } });
  } catch (error) {
    const status = Number(error.status) >= 400 && Number(error.status) < 600 ? Number(error.status) : 502;
    const message = String(error.message || "");
    const code = message.includes("MEDIA_RIGHTS_NOT_APPROVED") ? "MEDIA_RIGHTS_NOT_APPROVED" :
      message.includes("MEDIA_FILE_NOT_FOUND") ? "MEDIA_FILE_NOT_FOUND" :
      message.includes("ARTICLE_NOT_FOUND") ? "ARTICLE_NOT_FOUND" : "MEDIA_LIBRARY_FAILED";
    const safeMessage = code === "MEDIA_RIGHTS_NOT_APPROVED"
      ? "El recurso todavía no tiene autorización editorial de uso."
      : code === "ARTICLE_NOT_FOUND" ? "No se encontró la publicación."
      : code === "MEDIA_FILE_NOT_FOUND" ? "No se encontró el archivo de la biblioteca."
      : "No fue posible completar la operación de biblioteca.";
    return send(res, status, { error: { code, message: safeMessage } });
  }
};
