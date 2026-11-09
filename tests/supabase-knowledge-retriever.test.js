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
