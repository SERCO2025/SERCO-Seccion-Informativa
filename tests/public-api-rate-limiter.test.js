"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createPublicRateLimiter,
  getClientAddress,
  PublicRateLimitConfigurationError
} = require("../src/services/security/public-api-rate-limiter");

test("obtiene la dirección del último salto reenviado por Vercel", () => {
  assert.equal(getClientAddress({ headers: { "x-forwarded-for": "198.51.100.10, 203.0.113.7" } }), "203.0.113.7");
  assert.equal(getClientAddress({ headers: {} }), "");
});

test("envía únicamente un hash HMAC al RPC de cuotas", async () => {
  let request;
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, async json() { return true; } };
    }
  });

  const allowed = await limiter.consume({
    headers: { "x-forwarded-for": "198.51.100.10" }
  }, "research");

  assert.equal(allowed, true);
  assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/consume_public_api_quota");
  const body = JSON.parse(request.options.body);
  assert.equal(body.p_scope, "research");
  assert.match(body.p_client_hash, /^[0-9a-f]{64}$/);
  assert.equal(body.p_client_hash.includes("198.51.100.10"), false);
});

test("falla de forma cerrada cuando no existe una dirección de origen", async () => {
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => ({ ok: true, async json() { return true; } })
  });
  await assert.rejects(
    () => limiter.consume({ headers: {} }, "ask"),
    PublicRateLimitConfigurationError
  );
});

test("rechaza una respuesta no booleana del RPC", async () => {
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => ({ ok: true, async json() { return { allowed: true }; } })
  });
  await assert.rejects(
    () => limiter.consume({ headers: { "x-forwarded-for": "198.51.100.10" } }, "ask"),
    PublicRateLimitConfigurationError
  );
});
