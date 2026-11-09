"use strict";

const { createHmac } = require("node:crypto");

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
  return addresses.length ? addresses[addresses.length - 1].replace(/^\[|\]$/g, "") : "";
}

function createPublicRateLimiter(options = {}) {
  const supabaseUrl = (options.url || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const secretKey = options.secretKey || process.env.SUPABASE_SECRET_KEY || "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return {
    async consume(req, scope) {
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

      const clientHash = createHmac("sha256", secretKey).update(address).digest("hex");
      let response;
      try {
        response = await fetchImpl(supabaseUrl + "/rest/v1/rpc/consume_public_api_quota", {
          method: "POST",
          headers: {
            apikey: secretKey,
            Authorization: "Bearer " + secretKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ p_scope: scope, p_client_hash: clientHash })
        });
      } catch {
        throw new PublicRateLimitConfigurationError("No fue posible verificar el límite de solicitudes.");
      }

      if (!response.ok) {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un error.");
      }

      let allowed;
      try {
        allowed = await response.json();
      } catch {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió una respuesta inválida.");
      }

      if (typeof allowed !== "boolean") {
        throw new PublicRateLimitConfigurationError("El control de solicitudes devolvió un resultado no reconocido.");
      }
      return allowed;
    }
  };
}

module.exports = {
  createPublicRateLimiter,
  getClientAddress,
  PublicRateLimitConfigurationError
};
