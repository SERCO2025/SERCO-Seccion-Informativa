"use strict";

const { AskInputError, AskAdapterError } = require("./ask-orchestrator");

const MAX_BODY_BYTES = 8192;

function send(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function parseBody(req) {
  const contentLength = Number(req.headers && req.headers["content-length"]);

  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    const error = new Error("El cuerpo de la solicitud supera el límite permitido.");
    error.code = "BODY_TOO_LARGE";
    throw error;
  }

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      const error = new Error("El cuerpo de la solicitud no contiene JSON válido.");
      error.code = "INVALID_JSON";
      throw error;
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Se esperaba un objeto JSON.");
    error.code = "INVALID_BODY";
    throw error;
  }

  return body;
}

function createAskHttpHandler(orchestrator) {
  if (!orchestrator || typeof orchestrator.ask !== "function") {
    throw new TypeError("Se requiere un orquestador con el método ask().");
  }

  return async function askHttpHandler(req, res) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Este recurso solo acepta solicitudes POST."
        }
      });
    }

    let body;

    try {
      body = parseBody(req);
    } catch (error) {
      const status = error.code === "BODY_TOO_LARGE" ? 413 : 400;
      return send(res, status, {
        error: {
          code: error.code || "INVALID_REQUEST",
          message: error.message
        }
      });
    }

    try {
      const result = await orchestrator.ask({
        question: body.question,
        locale: body.locale
      });

      return send(res, 200, result);
    } catch (error) {
      if (error instanceof AskInputError) {
        return send(res, 400, {
          error: {
            code: error.code,
            message: error.message
          }
        });
      }

      if (error instanceof AskAdapterError) {
        const notReady = error.code === "ADAPTER_NOT_CONFIGURED";
        return send(res, 503, {
          error: {
            code: notReady ? "SERVICE_NOT_READY" : "KNOWLEDGE_PIPELINE_UNAVAILABLE",
            message: notReady
              ? "El servicio de consulta todavía no está conectado a sus componentes de conocimiento."
              : "No fue posible completar la consulta en este momento."
          }
        });
      }

      return send(res, 500, {
        error: {
          code: "INTERNAL_ERROR",
          message: "Ocurrió un error interno al procesar la consulta."
        }
      });
    }
  };
}

module.exports = {
  createAskHttpHandler,
  parseBody,
  MAX_BODY_BYTES
};
