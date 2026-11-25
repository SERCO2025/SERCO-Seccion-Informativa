"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {discoverPublisherMediaCandidates,extractImageReferences,safeImageUrl}=require("../src/services/publisher/media-candidate-discovery");
const plan={topic:"Resistencia a compresión del concreto",focus:"ensayos de compresión de cilindros de concreto",query:"concreto resistencia compresion cilindros ensayo"};
test("detecta imágenes extraídas y conserva procedencia y contexto",()=>{const source={title:"Informe de ensayo de concreto",url:"https://laboratorio.example/informe",rawContent:"## Resistencia a compresión\nLa prueba de cilindros de concreto registró resultados. ![Cilindros de concreto después del ensayo](https://cdn.laboratorio.example/figures/concrete-cylinder-test.jpg)"};const candidates=discoverPublisherMediaCandidates([source],plan);assert.equal(candidates.length,1);assert.equal(candidates[0].source_url,source.url);assert.equal(candidates[0].rights_status,"unverified");assert.equal(candidates[0].publication_allowed,false);assert.ok(candidates[0].matched_topic_terms.includes("concreto"))});
test("detecta img HTML y resuelve rutas relativas HTTPS",()=>{const refs=extractImageReferences('<img src="/media/concrete-strength.webp" alt="Concrete strength test">');assert.equal(refs.length,1);assert.equal(safeImageUrl(refs[0].url,"https://lab.example/report"),"https://lab.example/media/concrete-strength.webp")});
test("rechaza HTTP, SVG, rastreadores, logos y redes sociales",()=>{assert.equal(safeImageUrl("http://lab.example/concrete.jpg","https://lab.example/report"),"");assert.equal(safeImageUrl("https://lab.example/diagram.svg","https://lab.example/report"),"");assert.equal(safeImageUrl("https://lab.example/assets/company-logo.png","https://lab.example/report"),"");assert.equal(safeImageUrl("https://reddit.com/image.jpg","https://lab.example/report"),"")});
test("omite recursos sin relación temática y deduplica URL",()=>{const source={title:"Documento",url:"https://lab.example/report",rawContent:"![Logotipo](https://cdn.example/logo.png) ![Paisaje urbano](https://cdn.example/city.jpg) ![Concreto de ensayo](https://cdn.example/concrete-test.jpg) ![Concreto repetido](https://cdn.example/concrete-test.jpg)"};const candidates=discoverPublisherMediaCandidates([source],plan);assert.equal(candidates.length,1);assert.equal(candidates[0].alt_text,"Concreto de ensayo")});

test("incluye imágenes vinculadas por Tavily y acepta iconografía temática",()=>{
 const source={title:"Resistencia a compresión del concreto",url:"https://laboratorio.example/informe",images:[{url:"https://cdn.laboratorio.example/icons/concrete-strength-test.png",description:"Icono técnico de ensayo de resistencia del concreto"}]};
 const candidates=discoverPublisherMediaCandidates([source],plan);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].media_type,"image");
 assert.equal(candidates[0].detected_by,"tavily_source_image");
 assert.equal(candidates[0].rights_status,"unverified");
 assert.equal(candidates[0].publication_allowed,false);
});
test("detecta referencias a videos MP4 y reproductores YouTube o Vimeo",()=>{
 const source={title:"Resistencia a compresión del concreto",url:"https://laboratorio.example/informe",rawContent:'<iframe src="https://www.youtube.com/embed/abc123" title="Ensayo de compresión de concreto"></iframe><video><source src="https://cdn.laboratorio.example/video/concrete-compression.mp4"></video>'};
 const candidates=discoverPublisherMediaCandidates([source],plan);
 assert.equal(candidates.length,2);
 assert.ok(candidates.every(item=>item.media_type==="video"));
 assert.ok(candidates.every(item=>item.rights_status==="unverified"&&item.publication_allowed===false));
});
