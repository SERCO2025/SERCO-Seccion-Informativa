"use strict";
const fs = require("node:fs");
const path = require("node:path");
const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const ADMIN_EMAIL = (process.env.SERCO_ADMIN_EMAIL || "").trim().toLowerCase();

module.exports = async function editorPage(req, res) {
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end("Method Not Allowed");
  }
  const cookie = String(req.headers && req.headers.cookie || "");
  const match = cookie.match(/(?:^|;\s*)serco_editor_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : "";
  if (!BASE || !PUBLIC_KEY || !ADMIN_EMAIL || !token) {
    res.statusCode = 302;
    res.setHeader("Location", "/editor-login.html");
    return res.end();
  }
  try {
    const response = await fetch(BASE + "/auth/v1/user", {
      headers: { apikey: PUBLIC_KEY, Authorization: "Bearer " + token }
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok || String(user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      res.statusCode = 302;
      res.setHeader("Set-Cookie", "serco_editor_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
      res.setHeader("Location", "/editor-login.html");
      return res.end();
    }
    const html = fs.readFileSync(path.join(__dirname, "../src/private/dashboard.html"), "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch {
    return res.status(503).send("No fue posible verificar el acceso administrativo.");
  }
};
