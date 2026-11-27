"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-media-test";
process.env.SUPABASE_SECRET_KEY = "sb_secret_media_test";
process.env.SERCO_ADMIN_EMAIL = "admin@example.org";

const mediaLibraryApi = require("../api/editor-media-library");
const { createArticlePersistence } = require("../src/services/editor/article-persistence");

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

test("el JavaScript del estudio editorial compila con el selector de biblioteca", () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/editor-studio.js"), "utf8");
  const match = source.match(/<script>\s*([\s\S]*?)\s*<\/script>/i);
  assert.ok(match, "Debe existir el bloque JavaScript del estudio editorial");
  assert.doesNotThrow(() => new vm.Script(match[1]), "El JavaScript del estudio debe ser sintácticamente válido");
});

test("el endpoint de biblioteca y el preparador de cargas se pueden importar", () => {
  assert.equal(typeof require("../api/editor-media-library"), "function");
  assert.equal(typeof require("../api/editor-upload"), "function");
});

test("el editor conserva y permite revisar los derechos del flujo antiguo article_assets", () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/editor-studio.js"), "utf8");
  assert.ok(source.includes("Estado de derechos (revisión editorial)"));
  assert.ok(source.includes('rights_status:a.rights_status||"unverified"'));
  assert.ok(source.includes('metadata:{...(a.metadata||{}),rights_status:a.rights_status||"unverified"}'));
  assert.ok(source.includes('rights_status:x.rights_status||"unverified"'));
});

test("la biblioteca no genera enlaces públicos para serco-media y firma los recursos", () => {
  const source = fs.readFileSync(path.join(__dirname, "../api/editor-media-library.js"), "utf8");
  assert.ok(source.includes("/storage/v1/object/sign/"));
  assert.doesNotMatch(source, /object\/public\/.*serco-media/);
  assert.doesNotMatch(source, /if \(item\.bucket_id === "serco-media"\)/);
});

test("la biblioteca usa sb_secret sin Bearer en REST y Storage", async () => {
  const previousFetch = global.fetch;
  const restCalls = [];
  const storageCalls = [];
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/v1/user")) {
      assert.equal(options.headers.apikey, "publishable-media-test");
      assert.equal(options.headers.Authorization, "Bearer admin-session-token");
      return jsonResponse({ id: "admin-user", email: "admin@example.org" });
    }
    if (url.includes("/rest/v1/media_files?")) {
      restCalls.push(options);
      return jsonResponse([{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bucket_id: "serco-publicaciones",
        storage_path: "biblioteca/prueba.png",
        original_name: "prueba.png",
        rights_status: "unverified"
      }]);
    }
    if (url.includes("/storage/v1/object/sign/")) {
      storageCalls.push(options);
      return jsonResponse({ signedURL: "https://example.supabase.co/storage/v1/object/sign/serco-publicaciones/biblioteca/prueba.png?token=test" });
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const res = responseRecorder();
    await mediaLibraryApi({
      method: "GET",
      headers: { authorization: "Bearer admin-session-token" },
      query: {}
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.items.length, 1);
    assert.equal(restCalls.length, 1);
    assert.equal(storageCalls.length, 1);
    for (const call of [...restCalls, ...storageCalls]) {
      assert.equal(call.headers.apikey, "sb_secret_media_test");
      assert.equal(call.headers.Authorization, undefined);
    }
  } finally {
    global.fetch = previousFetch;
  }
});

test("la biblioteca conserva compatibilidad con claves JWT de service_role anteriores", async () => {
  const previousFetch = global.fetch;
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const modulePath = require.resolve("../api/editor-media-library");
  process.env.SUPABASE_SECRET_KEY = "legacy-service-role-jwt";
  delete require.cache[modulePath];
  const legacyMediaLibraryApi = require("../api/editor-media-library");
  let databaseHeaders = null;
  global.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/v1/user")) return jsonResponse({ id: "admin-user", email: "admin@example.org" });
    if (url.includes("/rest/v1/media_files?")) {
      databaseHeaders = options.headers;
      return jsonResponse([]);
    }
    throw new Error("Unexpected request: " + url);
  };
  try {
    const res = responseRecorder();
    await legacyMediaLibraryApi({
      method: "GET",
      headers: { authorization: "Bearer admin-session-token" },
      query: {}
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(databaseHeaders.apikey, "legacy-service-role-jwt");
    assert.equal(databaseHeaders.Authorization, "Bearer legacy-service-role-jwt");
  } finally {
    global.fetch = previousFetch;
    process.env.SUPABASE_SECRET_KEY = previousSecret;
    delete require.cache[modulePath];
    require("../api/editor-media-library");
  }
});

test("no permite publicar adjuntos directos con derechos no aprobados", async () => {
  let persistenceCalls = 0;
  const persistence = createArticlePersistence({
    url: "https://example.supabase.co",
    secretKey: "sb_secret_media_test",
    fetchImpl: async () => {
      persistenceCalls += 1;
      return jsonResponse({ article_id: "article-test" });
    }
  });
  const document = {
    title: "Procedimiento de prueba de publicación",
    summary: "Resumen de prueba suficientemente extenso para validar la persistencia editorial.",
    content_html: "<p>Contenido técnico de prueba con suficiente extensión para cumplir la validación.</p>",
    content_text: "Contenido técnico de prueba con suficiente extensión para cumplir la validación.",
    author_name: "SERCO",
    specialty: "Construcción",
    categories: ["Construcción"],
    sources: [{ title: "Fuente de prueba", source_url: "https://example.org/fuente" }],
    status: "published",
    assets: [{
      storage_path: "articulos/prueba.png",
      original_name: "prueba.png",
      alt_text: "Imagen de prueba",
      description: "Imagen de prueba para validar el bloqueo editorial.",
      source_url: "https://example.org/imagen",
      license: "Licencia de prueba",
      keywords: ["prueba"],
      rights_status: "unverified",
      metadata: { rights_status: "unverified" }
    }]
  };

  await assert.rejects(
    () => persistence.save({ document }),
    /No se puede publicar.*derechos no aprobados/
  );
  assert.equal(persistenceCalls, 0, "La validación debe detener la operación antes de llamar a Supabase.");
});
