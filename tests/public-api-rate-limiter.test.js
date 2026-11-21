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

test("reserva cuota con identificador único y devuelve la reserva al RPC", async () => {
  const requests = [];
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, async json() { return true; } };
    }
  });

  const reservation = await limiter.reserve({
    headers: { "x-forwarded-for": "198.51.100.10" }
  }, "research");

  assert.equal(reservation.allowed, true);
  assert.match(reservation.reservationId, /^[0-9a-f-]{36}$/i);
  assert.equal(requests[0].url, "https://example.supabase.co/rest/v1/rpc/reserve_public_api_quota");
  assert.equal(requests[0].body.p_scope, "research");
  assert.equal(requests[0].body.p_reservation_id, reservation.reservationId);
  assert.match(requests[0].body.p_client_hash, /^[0-9a-f]{64}$/);
});

test("libera una reserva mediante RPC idempotente", async () => {
  let request;
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return { ok: true, async json() { return true; } };
    }
  });
  const reservationId = "9d5b4e21-0d7c-4b55-9a8d-4f23e51a4c70";
  assert.equal(await limiter.release(reservationId), true);
  assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/release_public_api_quota");
  assert.deepEqual(request.body, { p_reservation_id: reservationId });
});

test("rechaza identificadores de reserva inválidos antes de llamar Supabase", async () => {
  let calls = 0;
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async () => { calls += 1; return { ok: true, async json() { return true; } }; }
  });
  await assert.rejects(() => limiter.release("no-es-uuid"), TypeError);
  assert.equal(calls, 0);
});

test("completa una reserva exitosa sin modificar los contadores", async () => {
  let request;
  const limiter = createPublicRateLimiter({
    url: "https://example.supabase.co",
    secretKey: "server-secret",
    fetchImpl: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return { ok: true, async json() { return true; } };
    }
  });
  const reservationId = "9d5b4e21-0d7c-4b55-9a8d-4f23e51a4c70";
  assert.equal(await limiter.complete(reservationId), true);
  assert.equal(request.url, "https://example.supabase.co/rest/v1/rpc/complete_public_api_quota");
  assert.deepEqual(request.body, { p_reservation_id: reservationId });
});
