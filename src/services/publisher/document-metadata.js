"use strict";

function normalizePublishedDate(value) {
  const dateText = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const parsed = new Date(dateText + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateText) return null;
  return dateText;
}

function createArticleSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

module.exports = { normalizePublishedDate, createArticleSlug };
