"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {sanitizeHtml}=require("../src/services/editor/article-persistence");
test("el sanitizador conserva únicamente el marcado seguro de conceptos técnicos",()=>{
 const input='<p>El <span class="technical-concept" data-concept-key="revenimiento">revenimiento</span> se mide.</p><span class="technical-concept" data-concept-key="bad key">inválido</span><span class="other" data-concept-key="revenimiento">clase no autorizada</span>';
 const output=sanitizeHtml(input);
 assert.ok(output.includes('<span class="technical-concept" data-concept-key="revenimiento">revenimiento</span>'));
 assert.ok(!output.includes("bad key"));
 assert.ok(!output.includes('class="other"'));
});
test("la vista pública ofrece popovers accesibles y relaciones entre conceptos",()=>{
 const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
 const html=fs.readFileSync(path.join(__dirname,"../publication.html"),"utf8");
 assert.ok(html.includes("function renderConcepts(items)"));
 assert.ok(html.includes("Conceptos relacionados: "));
 assert.ok(html.includes('aria-haspopup'));
 const start=html.indexOf("<script>"),end=html.indexOf("</script>",start+8);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
});
test("el editor incorpora conceptos solo con fuente documentada y permite vincular selección",()=>{
 const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
 const html=fs.readFileSync(path.join(__dirname,"../api/editor-studio.js"),"utf8");
 for(const marker of ["function addEditorialConcept()","function linkSelectedConcept()","function validateEditorialConcepts(contentHtml)","concept-link-select","editorialMetadata.concepts"])assert.ok(html.includes(marker),"Falta: "+marker);
 const start=html.indexOf("<script>"),end=html.indexOf("</script>",start+8);
 assert.ok(start>=0&&end>start);
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end)));
});
