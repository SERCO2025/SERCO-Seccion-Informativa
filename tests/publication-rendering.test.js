"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return payload; } };
}

test("la API pública expone solo recursos reutilizables con derechos aprobados", async () => {
  process.env.SUPABASE_URL = "https://serco.example";
  process.env.SUPABASE_SECRET_KEY = "service-secret";
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.includes("/rest/v1/articles?")) return response([{
      id: "11111111-1111-4111-8111-111111111111",
      public_id: "CERCO-INFO-000001", slug: "prueba", title: "Prueba",
      summary: "Resumen", status: "published",
      published_version_id: "22222222-2222-4222-8222-222222222222"
    }]);
    if (value.includes("/rest/v1/article_versions?")) return response([{
      version_number: 1, content_json: { content_html: "<p>Texto.</p>" }
    }]);
    if (value.includes("/rest/v1/article_asset_links?")) return response([
      { id: "approved", section_key: "body", sort_order: 0, display_mode: "wide",
        media_file: { id: "media1", bucket_id: "serco-publicaciones", storage_path: "biblioteca/diagrama.png",
          original_name: "diagrama.png", mime_type: "image/png", rights_status: "verified", alt_text: "Diagrama" } },
      { id: "unverified", media_file: { id: "media2", bucket_id: "serco-publicaciones",
        storage_path: "biblioteca/no.png", original_name: "no.png", mime_type: "image/png", rights_status: "unverified" } }
    ]);
    if (value.includes("/storage/v1/object/sign/")) return response({
      signedURL: "/object/sign/serco-publicaciones/biblioteca/diagrama.png?token=test"
    });
    if (value.includes("/rest/v1/")) return response([]);
    throw new Error("Unexpected fetch " + value);
  };
  try {
    delete require.cache[require.resolve("../api/publication")];
    const handler = require("../api/publication");
    const req = { method: "GET", query: { public_id: "CERCO-INFO-000001" } };
    const res = {
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; }
    };
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.asset_links.length, 1);
    assert.equal(res.payload.asset_links[0].media_file.rights_status, "verified");
    assert.ok(res.payload.asset_links[0].media_file.url.includes("/storage/v1/object/sign/"));
    assert.equal(calls.some(url => url.includes("no.png")), false);
  } finally {
    global.fetch = originalFetch;
    delete require.cache[require.resolve("../api/publication")];
  }
});

test("la plantilla pública incorpora jerarquía editorial, recursos y referencias", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const html = fs.readFileSync(path.join(__dirname, "../publication.html"), "utf8");
  for (const marker of ["class=\"paper\"", "class=\"article\"", "class=\"grid\"",
    "Fuentes y referencias", "Fuente del recurso", "Publicaciones relacionadas", "video.controls=true", "loading=\"lazy\""]) {
    assert.ok(html.includes(marker), "Falta soporte: " + marker);
  }
});
