"use strict";

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const ADMIN_EMAIL = (process.env.SERCO_ADMIN_EMAIL || "").trim().toLowerCase();

function reply(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(payload);
}
function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch {}
  }
  return {};
}
module.exports = async function editorAuth(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Usa POST." } });
  }
  if (!BASE || !PUBLIC_KEY || !ADMIN_EMAIL) {
    return reply(res, 503, { error: { code: "EDITOR_AUTH_NOT_CONFIGURED", message: "Falta configurar SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SERCO_ADMIN_EMAIL en el servidor." } });
  }
  const body = bodyOf(req);
  const action = body.action || "login";
  const token = typeof body.access_token === "string" ? body.access_token : "";
  try {
    if (action === "login") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (email !== ADMIN_EMAIL) return reply(res, 403, { error: { code: "ADMIN_ONLY", message: "Esta cuenta no está autorizada para el editor." } });
      if (!password || password.length > 1024) return reply(res, 400, { error: { code: "INVALID_CREDENTIALS", message: "Introduce la contraseña de la cuenta autorizada." } });
      const response = await fetch(BASE + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.access_token || !result.user) {
        return reply(res, 401, { error: { code: "LOGIN_FAILED", message: "No se pudo iniciar sesión. Revisa las credenciales y la confirmación del correo." } });
      }
      if (String(result.user.email || "").toLowerCase() !== ADMIN_EMAIL) {
        return reply(res, 403, { error: { code: "ADMIN_ONLY", message: "La cuenta autenticada no está autorizada." } });
      }
      return reply(res, 200, { access_token: result.access_token, refresh_token: result.refresh_token, expires_in: result.expires_in, user: { id: result.user.id, email: result.user.email } });
    }
    if (action === "verify") {
      if (!token) return reply(res, 401, { error: { code: "UNAUTHORIZED", message: "Sesión no válida." } });
      const response = await fetch(BASE + "/auth/v1/user", { headers: { apikey: PUBLIC_KEY, Authorization: "Bearer " + token } });
      const user = await response.json().catch(() => ({}));
      if (!response.ok || String(user.email || "").toLowerCase() !== ADMIN_EMAIL) {
        return reply(res, 401, { error: { code: "UNAUTHORIZED", message: "La sesión no pertenece a la cuenta administradora autorizada." } });
      }
      return reply(res, 200, { user: { id: user.id, email: user.email } });
    }
    if (action === "logout") {
      if (token) await fetch(BASE + "/auth/v1/logout", { method: "POST", headers: { apikey: PUBLIC_KEY, Authorization: "Bearer " + token } }).catch(() => {});
      return reply(res, 200, { ok: true });
    }
    return reply(res, 400, { error: { code: "INVALID_ACTION", message: "Acción no reconocida." } });
  } catch {
    return reply(res, 502, { error: { code: "AUTH_UPSTREAM_ERROR", message: "No fue posible comunicarse con Supabase Auth." } });
  }
};
