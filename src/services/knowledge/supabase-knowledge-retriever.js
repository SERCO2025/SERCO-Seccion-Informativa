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
          })
        });
      } catch {
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

      let rows;
      try {
        rows = await response.json();
      } catch {
        throw new SupabaseRetrieverError(
          "Supabase devolvió una respuesta de búsqueda inválida.",
          "SUPABASE_RETRIEVER_INVALID_RESPONSE"
        );
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
          slug: row.slug,
          title: row.title,
          version: row.version,
          section: typeof row.section === "string" ? row.section : null,
          content: row.content,
          excerpt: row.content.slice(0, 320),
          rank: typeof row.rank === "number" ? row.rank : null
        };
      });

      return { items };
    }
  };
}

module.exports = {
  createSupabaseKnowledgeRetriever,
  SupabaseRetrieverConfigurationError,
  SupabaseRetrieverError
};
