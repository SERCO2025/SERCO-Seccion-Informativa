"use strict";

function getCitationOrder(source, index) {
  const sourceId = source && source.id;
  return Number.isInteger(sourceId) && sourceId > 0
    ? sourceId
    : Math.max(1, Number.isInteger(index) ? index + 1 : 1);
}

module.exports = { getCitationOrder };
