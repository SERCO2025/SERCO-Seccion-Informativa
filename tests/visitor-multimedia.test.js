"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
test("la interfaz de consultas muestra multimedia de citas con DOM seguro y accesible", () => {
 const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
 assert.ok(html.includes('id="officialMedia"'));
 assert.ok(html.includes('id="officialMediaGrid"'));
 assert.ok(html.includes("function renderOfficialMedia(citations)"));
 assert.ok(html.includes('video.controls=true'));
 assert.ok(html.includes('img.loading="lazy"'));
 const start=html.indexOf("<script>"),end=html.indexOf("</script>",start+8);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
});
