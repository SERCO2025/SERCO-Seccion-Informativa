"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSupabaseKnowledgeRetriever,
  SupabaseRetrieverConfigurationError,
  SupabaseRetrieverError
} = require("../src/services/knowledge/supabase-knowledge-retriever");

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; }
  };
}

const row = {
  chunk_id: "chunk-uuid",
  article_id: "article-uuid",
  public_id: null,
  slug: "tipos-de-cimentacion",
  title: "Tipos de cimentación",
  version: 2,
  section: "Clasificación",
  content: "La publicación describe zapatas aisladas y corridas.",
  rank: 0.42
};

test("consulta únicamente la función RPC de fragmentos publicados", async () => {
  let captured;
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co/",
    secretKey: "server-secret",
    fetchImpl: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return jsonResponse([row]);
    }
  });

  const result = await retriever.search({
    query: "cimentacion zapata",
    limit: 20,
    publicationStatus: "published"
  });

  assert.equal(captured.url, "https://example.supabase.co/rest/v1/rpc/search_published_chunks");
  assert.equal(captured.options.headers.apikey, "server-secret");
  assert.equal(captured.options.headers.Authorization, "Bearer server-secret");
  assert.deepEqual(captured.body, { p_query: "cimentacion zapata", p_limit: 8 });
  assert.equal(result.items[0].id, "chunk-uuid");
  assert.equal(result.items[0].articleId, "article-uuid");
  assert.equal(result.items[0].version, 2);
  assert.equal(result.items[0].excerpt, row.content);
});

test("no permite buscar borradores ni estados distintos de published", async () => {
  let calls = 0;
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => { calls += 1; return jsonResponse([]); }
  });

  await assert.rejects(
    retriever.search({ query: "consulta válida", limit: 8, publicationStatus: "draft" }),
    (error) => error instanceof SupabaseRetrieverError && error.code === "SUPABASE_RETRIEVER_INVALID_STATUS"
  );
  assert.equal(calls, 0);
});

test("rechaza consultas inválidas antes de acceder a Supabase", async () => {
  let calls = 0;
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => { calls += 1; return jsonResponse([]); }
  });

  await assert.rejects(
    retriever.search({ query: "  ", publicationStatus: "published" }),
    { code: "SUPABASE_RETRIEVER_INVALID_INPUT" }
  );
  assert.equal(calls, 0);
});

test("no realiza llamadas si faltan credenciales", async () => {
  let calls = 0;
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "",
    fetchImpl: async () => { calls += 1; return jsonResponse([]); }
  });

  await assert.rejects(retriever.search({
    query: "consulta válida",
    publicationStatus: "published"
  }), SupabaseRetrieverConfigurationError);
  assert.equal(calls, 0);
});

test("traduce errores HTTP sin exponer detalles internos", async () => {
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => jsonResponse({ message: "internal database detail" }, 403)
  });

  await assert.rejects(
    retriever.search({ query: "consulta válida", publicationStatus: "published" }),
    (error) => error.code === "SUPABASE_RETRIEVER_ACCESS_DENIED" &&
      !error.message.includes("internal database detail")
  );
});

test("rechaza filas de evidencia incompletas", async () => {
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => jsonResponse([{ ...row, version: "2" }])
  });

  await assert.rejects(
    retriever.search({ query: "consulta válida", publicationStatus: "published" }),
    { code: "SUPABASE_RETRIEVER_INVALID_EVIDENCE" }
  );
});

test("devuelve lista vacía cuando no hay coincidencias", async () => {
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => jsonResponse([])
  });

  const result = await retriever.search({
    query: "tema no documentado",
    publicationStatus: "published"
  });
  assert.deepEqual(result, { items: [] });
});


test("adjunta solo recursos aprobados y pertinentes a la sección de evidencia", async () => {
  const articleId = "11111111-1111-4111-8111-111111111111";
  const calls = [];
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co", secretKey: "server-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/rpc/search_published_chunks")) return jsonResponse([{ ...row, article_id: articleId, section: "Procedimiento" }]);
      if (url.includes("/rest/v1/article_asset_links?")) return jsonResponse([
        { article_id: articleId, section_key: "procedimiento", sort_order: 1, caption: "Detalle del armado", display_mode: "inline", media_file: { id: "image-1", bucket_id: "serco-media", storage_path: "obras/detalle 1.jpg", original_name: "detalle.jpg", mime_type: "image/jpeg", media_type: "image", alt_text: "Detalle de armado", description: "Unión de elementos", source_url: "https://source.example/photo", author: "Laboratorio", license: "Permiso concedido", rights_status: "permission_granted" } },
        { article_id: articleId, section_key: "introduccion", sort_order: 2, caption: "No corresponde a esta sección", display_mode: "inline", media_file: { id: "image-2", bucket_id: "serco-media", storage_path: "obras/otra.jpg", original_name: "otra.jpg", mime_type: "image/jpeg", alt_text: "Otra sección", rights_status: "verified" } },
        { article_id: articleId, section_key: "procedimiento", sort_order: 3, media_file: { id: "image-3", bucket_id: "serco-media", storage_path: "obras/no-autorizada.jpg", mime_type: "image/jpeg", rights_status: "unverified" } }
      ]);
      throw new Error("Unexpected request");
    }
  });
  const result = await retriever.search({ query: "consulta técnica", publicationStatus: "published" });
  assert.equal(result.items[0].assets.length, 1);
  assert.equal(result.items[0].assets[0].id, "image-1");
  assert.equal(result.items[0].assets[0].mediaType, "image");
  assert.equal(result.items[0].assets[0].altText, "Detalle de armado");
  assert.equal(result.items[0].assets[0].url, "https://example.supabase.co/storage/v1/object/public/serco-media/obras/detalle%201.jpg");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, "Bearer server-secret");
});
test("genera URL firmada de corta duración para recursos privados autorizados", async () => {
  const articleId = "22222222-2222-4222-8222-222222222222";
  const calls = [];
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co", secretKey: "server-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/rpc/search_published_chunks")) return jsonResponse([{ ...row, article_id: articleId }]);
      if (url.includes("/rest/v1/article_asset_links?")) return jsonResponse([
        { article_id: articleId, section_key: "body", sort_order: 1, media_file: { id: "pdf-1", bucket_id: "serco-publicaciones", storage_path: "biblioteca/manual 1.pdf", original_name: "manual.pdf", mime_type: "application/pdf", media_type: "document", alt_text: "Manual técnico", description: "Manual", source_url: "https://source.example/manual", author: "Fabricante", license: "Permiso", rights_status: "verified" } }
      ]);
      if (url.includes("/storage/v1/object/sign/")) return jsonResponse({ signedURL: "/object/sign/serco-publicaciones/biblioteca/manual%201.pdf?token=temporary" });
      throw new Error("Unexpected request");
    }
  });
  const result = await retriever.search({ query: "consulta técnica", publicationStatus: "published" });
  assert.equal(result.items[0].assets.length, 1);
  assert.equal(result.items[0].assets[0].mediaType, "document");
  assert.equal(result.items[0].assets[0].url, "https://example.supabase.co/storage/v1/object/sign/serco-publicaciones/biblioteca/manual%201.pdf?token=temporary");
  const signing = calls.find(call => call.url.includes("/storage/v1/object/sign/"));
  assert.deepEqual(JSON.parse(signing.options.body), { expiresIn: 1800 });
});
test("si el catálogo multimedia falla conserva las evidencias textuales", async () => {
  const articleId = "33333333-3333-4333-8333-333333333333";
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co", secretKey: "server-secret",
    fetchImpl: async url => {
      if (url.endsWith("/rpc/search_published_chunks")) return jsonResponse([{ ...row, article_id: articleId }]);
      return jsonResponse({ message: "catalog unavailable" }, 503);
    }
  });
  const result = await retriever.search({ query: "consulta técnica", publicationStatus: "published" });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].assets, []);
});

test("cancela la búsqueda si Supabase no responde dentro del tiempo máximo", async () => {
  const retriever = createSupabaseKnowledgeRetriever({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    timeoutMs: 5,
    fetchImpl: async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("request aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  });

  await assert.rejects(
    retriever.search({ query: "consulta válida", publicationStatus: "published" }),
    (error) => error instanceof SupabaseRetrieverError && error.code === "SUPABASE_RETRIEVER_TIMEOUT"
  );
});
