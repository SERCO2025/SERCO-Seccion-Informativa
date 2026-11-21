"use strict";

function normalizeSourceMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return { ...metadata };
}

module.exports = { normalizeSourceMetadata };
