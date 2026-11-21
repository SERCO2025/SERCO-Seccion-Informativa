"use strict";

const { createHmac, randomUUID } = require("node:crypto");

class PublicRateLimitConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PublicRateLimitConfigurationError";
    this.code = "PUBLIC_RATE_LIMIT_NOT_CONFIGURED";
  }
}

function getClientAddress(req) {
  const headers = req && req.headers ? req.headers : {};
  const forwarded = headers["x-vercel-forwarded-for"] || headers["x-forwarded-for"];
  if (typeof forwarded !== "string" || !forwarded.trim()) return "";
  const addresses = forwarded.split(",").map((value) => value.trim()).filter(Boolean);
  return addresses.length ? addresses[addresses.length - 1].replace(/^\\[|\\]$/g, "") : "";
}

function createPublicRateLimiter(options = {}) {
  const supabaseUrl = (options.url || process.env.SUPABASE_URL || "").replace(/\\/+$/, "");
  const secretKey = options.secretKey || process.env.SUPABASE_SECRET_KEY || "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  async function callRpc(functionName, body) {
    let response;
    try {
      response = await fetchImpl(supabaseUrl + "/rest/v1/rpc/" + functionName, {
        method: "POST",
        headers: {
          apikey: secretKey,
          Authorization: "Bearer " + secretKey,
          "Content-Type": "application/json"
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify(body)
      });
    } catch {
      throw new PublicRateLimitConfigurationError("No fue posible verificar el límite de solicitudes.");
    }

    if (!response.ok) {
      throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un error.");
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió una respuesta inválida.");
    }
    return result;
  }

  function getRequestIdentity(req, scope) {
    if (!["ask", "research"].includes(scope)) {
      throw new TypeError("El alcance del límite público no es válido.");
    }
    if (!supabaseUrl || !secretKey || typeof fetchImpl !== "function") {
      throw new PublicRateLimitConfigurationError("El control de solicitudes públicas no está configurado.");
    }
    const address = getClientAddress(req);
    if (!address) {
      throw new PublicRateLimitConfigurationError("No fue posible determinar el origen de la solicitud.");
    }
    return createHmac("sha256", secretKey).update(address).digest("hex");
  }

  return {
    async consume(req, scope) {
      const clientHash = getRequestIdentity(req, scope);
      const allowed = await callRpc("consume_public_api_quota", { p_scope: scope, p_client_hash: clientHash });
      if (typeof allowed !== "boolean") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un resultado no reconocido.");
      }
      return allowed;
    },

    async reserve(req, scope) {
      const clientHash = getRequestIdentity(req, scope);
      const reservationId = randomUUID();
      const allowed = await callRpc("reserve_public_api_quota", {
        p_scope: scope,
        p_client_hash: clientHash,
        p_reservation_id: reservationId
      });
      if (typeof allowed !== "boolean") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un resultado no reconocido.");
      }
      return { allowed, reservationId: allowed ? reservationId : null };
    },

    async release(reservationId) {
      if (typeof reservationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)) {
        throw new TypeError("El identificador de reserva no es válido.");
      }
      if (!supabaseUrl || !secretKey || typeof fetchImpl !== "function") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes públicas no está configurado.");
      }
      const released = await callRpc("release_public_api_quota", { p_reservation_id: reservationId });
      if (typeof released !== "boolean") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un resultado no reconocido.");
      }
      return released;
    },

    async complete(reservationId) {
      if (typeof reservationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationId)) {
        throw new TypeError("El identificador de reserva no es válido.");
      }
      if (!supabaseUrl || !secretKey || typeof fetchImpl !== "function") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes públicas no está configurado.");
      }
      const completed = await callRpc("complete_public_api_quota", { p_reservation_id: reservationId });
      if (typeof completed !== "boolean") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un resultado no reconocido.");
      }
      return completed;
    }
  };
}

module.exports = {
  createPublicRateLimiter,
  getClientAddress,
  PublicRateLimitConfigurationError
};
