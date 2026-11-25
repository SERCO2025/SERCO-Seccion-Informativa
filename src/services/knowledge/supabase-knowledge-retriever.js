"use strict";

class SupabaseRetrieverConfigurationError extends Error {
  constructor(message, code = "SUPABASE_RETRIEVER_NOT_CONFIGURED") {
    super(message);
    this.name = "SupabaseRetrieverConfigurationError";
    this.code = code;
  }
}

class SupabaseRetrieverError extends Error {
  constructor(message, code = "SUPABASE_RETRIEVER_ERROR") {
    super(message);
    this.name = "SupabaseRetrieverError";
    this.code = code;
  }
}


const APPROVED_MEDIA_RIGHTS = new Set(["verified", "permission_granted", "public_domain"]);
const SAFE_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const SAFE_VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/ogg"]);
const SAFE_DOCUMENT_MIMES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel", "text/plain"
]);
function validHttpUrl(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "http:" || url.protocol === "https:"; }
  catch { return false; }
}
function normalizeSection(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase();
}
function encodeStoragePath(value) {
  return String(value || "").split("/").map(encodeURIComponent).join("/");
}
async function loadApprovedArticleAssets({ articleIds, supabaseUrl, secretKey, fetchImpl, timeoutMs }) {
  const ids = [...new Set(articleIds.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))];
  const byArticle = new Map();
  if (!ids.length) return byArticle;
  try {
    const path = supabaseUrl + "/rest/v1/article_asset_links?select=article_id,section_key,sort_order,alt_text_override,caption,display_mode,media_file:media_files(id,bucket_id,storage_path,original_name,mime_type,media_type,alt_text,description,source_url,author,license,rights_status)&article_id=in.(" + ids.join(",") + ")&order=article_id.asc,section_key.asc,sort_order.asc&limit=80";
    const response = await fetchImpl(path, {
      method: "GET",
      headers: { apikey: secretKey, Authorization: "Bearer " + secretKey, Accept: "application/json" },
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
    });
    if (!response.ok) return byArticle;
    const rows = await response.json();
    if (!Array.isArray(rows)) return byArticle;
    for (const link of rows) {
      const media = Array.isArray(link.media_file) ? link.media_file[0] : link.media_file;
      if (!media || !APPROVED_MEDIA_RIGHTS.has(media.rights_status)) continue;
      if (!["serco-media", "serco-publicaciones"].includes(media.bucket_id) || !media.storage_path || String(media.storage_path).includes("..")) continue;
      const mimeType = String(media.mime_type || "").toLowerCase().split(";")[0].trim();
      const mediaType = SAFE_IMAGE_MIMES.has(mimeType) ? "image"
        : SAFE_VIDEO_MIMES.has(mimeType) ? "video"
        : SAFE_DOCUMENT_MIMES.has(mimeType) ? "document" : "";
      if (!mediaType) continue;
      let url = "";
      const encodedPath = encodeStoragePath(media.storage_path);
      if (media.bucket_id === "serco-media") {
        url = supabaseUrl + "/storage/v1/object/public/" + encodeURIComponent(media.bucket_id) + "/" + encodedPath;
      } else {
        try {
          const signed = await fetchImpl(supabaseUrl + "/storage/v1/object/sign/" + encodeURIComponent(media.bucket_id) + "/" + encodedPath, {
            method: "POST",
            headers: { apikey: secretKey, Authorization: "Bearer " + secretKey, "Content-Type": "application/json" },
            body: JSON.stringify({ expiresIn: 1800 }),
            signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
          });
          const data = await signed.json().catch(() => ({}));
          if (!signed.ok || !(data.signedURL || data.signedUrl)) continue;
          const signedUrl = data.signedURL || data.signedUrl;
          url = /^https?:\/\//i.test(signedUrl) ? signedUrl
            : supabaseUrl + "/storage/v1" + (signedUrl.startsWith("/") ? signedUrl : "/" + signedUrl);
        } catch { continue; }
      }
      if (!validHttpUrl(url)) continue;
      const asset = {
        id: media.id,
        mediaType,
        mimeType,
        url,
        altText: String(link.alt_text_override || media.alt_text || media.original_name || "Recurso técnico"),
        caption: String(link.caption || media.description || media.original_name || ""),
        description: String(media.description || ""),
        author: String(media.author || ""),
        license: String(media.license || ""),
        sourceUrl: validHttpUrl(media.source_url) ? media.source_url : null,
        displayMode: ["inline", "wide", "gallery", "download"].includes(link.display_mode) ? link.display_mode : "inline",
        sectionKey: String(link.section_key || "body")
      };
      if (!byArticle.has(link.article_id)) byArticle.set(link.article_id, []);
      const list = byArticle.get(link.article_id);
      if (list.length < 12 && !list.some(item => item.id === asset.id && item.sectionKey === asset.sectionKey)) list.push(asset);
    }
  } catch {
    // El contenido textual y sus citas siguen disponibles aunque falle el catálogo multimedia.
  }
  return byArticle;
}

function createSupabaseKnowledgeRetriever(options = {}) {
  const supabaseUrl = (options.url || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const secretKey = options.secretKey || process.env.SUPABASE_SECRET_KEY || "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    async search(input) {
      if (!input || typeof input.query !== "string" || input.query.trim().length < 3) {
        throw new SupabaseRetrieverError(
          "La búsqueda requiere una consulta de al menos tres caracteres.",
          "SUPABASE_RETRIEVER_INVALID_INPUT"
        );
      }

      if (input.publicationStatus !== "published") {
        throw new SupabaseRetrieverError(
          "El recuperador solo permite buscar publicaciones vigentes.",
          "SUPABASE_RETRIEVER_INVALID_STATUS"
        );
      }

      if (!supabaseUrl || !secretKey) {
        throw new SupabaseRetrieverConfigurationError(
          "Falta configurar SUPABASE_URL o SUPABASE_SECRET_KEY en el servidor."
        );
      }

      if (typeof fetchImpl !== "function") {
        throw new SupabaseRetrieverConfigurationError(
          "El entorno no dispone de fetch para conectar con Supabase."
        );
      }

      const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? Math.min(Math.floor(options.timeoutMs), 120000)
        : 15000;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let rows;

      try {
        let response;
        try {
          response = await fetchImpl(supabaseUrl + "/rest/v1/rpc/search_published_chunks", {
            method: "POST",
            headers: {
              apikey: secretKey,
              Authorization: "Bearer " + secretKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              p_query: input.query.trim(),
              p_limit: Math.max(1, Math.min(Number.isInteger(input.limit) ? input.limit : 8, 8))
            }),
            signal: controller.signal
          });
        } catch {
          if (controller.signal.aborted) {
            throw new SupabaseRetrieverError(
              "La búsqueda de conocimiento excedió el tiempo máximo de respuesta.",
              "SUPABASE_RETRIEVER_TIMEOUT"
            );
          }
          throw new SupabaseRetrieverError(
            "No fue posible conectar con la base de conocimiento de SERCO.",
            "SUPABASE_RETRIEVER_UNAVAILABLE"
          );
        }

        if (!response.ok) {
          const code = response.status === 401 || response.status === 403
            ? "SUPABASE_RETRIEVER_ACCESS_DENIED"
            : response.status >= 500
              ? "SUPABASE_RETRIEVER_UPSTREAM_ERROR"
              : "SUPABASE_RETRIEVER_REQUEST_REJECTED";

          throw new SupabaseRetrieverError(
            "Supabase no pudo completar la búsqueda de conocimiento.",
            code
          );
        }

        try {
          rows = await response.json();
        } catch {
          if (controller.signal.aborted) {
            throw new SupabaseRetrieverError(
              "La búsqueda de conocimiento excedió el tiempo máximo de respuesta.",
              "SUPABASE_RETRIEVER_TIMEOUT"
            );
          }
          throw new SupabaseRetrieverError(
            "Supabase devolvió una respuesta de búsqueda inválida.",
            "SUPABASE_RETRIEVER_INVALID_RESPONSE"
          );
        }
      } finally {
        clearTimeout(timeout);
      }

      if (!Array.isArray(rows)) {
        throw new SupabaseRetrieverError(
          "Supabase devolvió una estructura de búsqueda no reconocida.",
          "SUPABASE_RETRIEVER_INVALID_RESPONSE"
        );
      }

      const items = rows.map((row) => {
        if (
          !row ||
          typeof row.chunk_id !== "string" ||
          typeof row.article_id !== "string" ||
          typeof row.slug !== "string" ||
          typeof row.title !== "string" ||
          (row.public_id !== null && typeof row.public_id !== "string") ||
          !Number.isInteger(row.version) ||
          typeof row.content !== "string" ||
          !row.content.trim()
        ) {
          throw new SupabaseRetrieverError(
            "Supabase devolvió un fragmento incompleto.",
            "SUPABASE_RETRIEVER_INVALID_EVIDENCE"
          );
        }

        return {
          id: row.chunk_id,
          articleId: row.article_id,
          publicId: typeof row.public_id === "string" ? row.public_id : null,
          slug: row.slug,
          title: row.title,
          version: row.version,
          section: typeof row.section === "string" ? row.section : null,
          content: row.content,
          excerpt: row.content.slice(0, 320),
          rank: typeof row.rank === "number" ? row.rank : null,
          sources: Array.isArray(row.sources) ? row.sources.filter((source) => source && typeof source.title === "string" && typeof source.source_url === "string") : []
        };
      });

      const assetsByArticle = await loadApprovedArticleAssets({
        articleIds: items.map(item => item.articleId),
        supabaseUrl,
        secretKey,
        fetchImpl,
        timeoutMs
      });
      for (const item of items) {
        const section = normalizeSection(item.section);
        item.assets = (assetsByArticle.get(item.articleId) || []).filter(asset =>
          normalizeSection(asset.sectionKey) === "body" ||
          (section && normalizeSection(asset.sectionKey) === section)
        );
      }

      return { items };
    }
  };
}

module.exports = {
  createSupabaseKnowledgeRetriever,
  SupabaseRetrieverConfigurationError,
  SupabaseRetrieverError
};
