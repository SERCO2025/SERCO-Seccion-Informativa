"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getCitationOrder } = require("../src/services/research/citation-order");

test("conserva el identificador de cita asignado a cada fuente", () => {
  assert.equal(getCitationOrder({ id: 3 }, 0), 3);
  assert.equal(getCitationOrder({ id: 1 }, 2), 1);
});

test("asigna un orden estable cuando la fuente no tiene identificador válido", () => {
  assert.equal(getCitationOrder({}, 0), 1);
  assert.equal(getCitationOrder({ id: 0 }, 1), 2);
  assert.equal(getCitationOrder({ id: "2" }, 2), 3);
});
