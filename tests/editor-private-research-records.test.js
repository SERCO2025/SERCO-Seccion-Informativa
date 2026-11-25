"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test";
process.env.SUPABASE_SECRET_KEY = "secret-test";
process.env.SERCO_ADMIN_EMAIL = "admin@example.org";

const editorApi = require("../api/editor");

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test("el editor autenticado recupera el expediente privado de investigación", async () => {
  const previousFetch = global.fetch;
  const articleId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const versionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const record = {
    article_id: articleId,
    article_version_id: versionId,
    research_status: "completed",
    internal_report: "INFORME INTERNO PRIVADO DE PRUEBA",
    visitor_answer: "Respuesta inicial [1].",
    expanded_answer: "Explicación ampliada [1].",
    claim_evidence: [{ section: "visitorAnswer", claim: "Respuesta inicial [1].", assessment: "supported", sourceIds: [1] }]
  };
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user")) return jsonResponse({ id: "admin-user", email: "admin@example.org" });
    if (url.includes("/rest/v1/articles?select=*")) return jsonResponse([{
      id: articleId, origin: "ai_research", title: "Investigación de prueba", status: "review",
      public_id: "SERCO-TEST", created_at: "2026-11-25T00:00:00Z"
    }]);
    if (url.includes("/rest/v1/article_versions?")) return jsonResponse([{
      id: versionId, article_id: articleId, version_number: 1,
      content_json: { visitorAnswer: record.visitor_answer, expandedAnswer: record.expanded_answer }
    }]);
    if (url.includes("/rest/v1/article_sources?")) return jsonResponse([]);
    if (url.includes("/rest/v1/article_assets?")) return jsonResponse([]);
    if (url.includes("/rest/v1/article_categories?")) return jsonResponse([]);
    if (url.includes("/rest/v1/article_tags?")) return jsonResponse([]);
    if (url.includes("/rest/v1/article_relations?")) return jsonResponse([]);
    if (url.endsWith("/rest/v1/rpc/get_article_research_records")) {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { p_article_id: articleId });
      assert.equal(options.headers.apikey, "secret-test");
      return jsonResponse([record]);
    }
    throw new Error("Unexpected request: " + url);
  };

  try {
    const res = responseRecorder();
    await editorApi({
      method: "GET",
      headers: { authorization: "Bearer admin-session-token" },
      query: { id: articleId }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.research_records.length, 1);
    assert.equal(res.payload.research_records[0].internal_report, record.internal_report);
    assert.equal(res.payload.research_records[0].claim_evidence.length, 1);
    assert.equal(calls.some(call => call.url.endsWith("/rest/v1/rpc/get_article_research_records")), true);
  } finally {
    global.fetch = previousFetch;
  }
});

test("el editor muestra el expediente interno como texto y usa la trazabilidad privada", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "../api/editor-studio.js"), "utf8");
  assert.ok(source.includes('id="detail-internal-report"'));
  assert.ok(source.includes('id="detail-internal-report-panel"'));
  assert.ok(source.includes('textContent=researchRecord?.internal_report'));
  assert.ok(source.includes("researchRecord.claim_evidence"));
});
