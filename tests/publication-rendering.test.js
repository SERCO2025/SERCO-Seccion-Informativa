"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
function response(payload,status=200){return{ok:status>=200&&status<300,status,async json(){return payload}}}
test("la API pública expone solo recursos reutilizables con derechos aprobados",async()=>{
 process.env.SUPABASE_URL="https://serco.example";process.env.SUPABASE_SECRET_KEY="service-secret";
 const originalFetch=global.fetch,calls=[];
 global.fetch=async(url)=>{const u=String(url);calls.push(u);
  if(u.includes("/rest/v1/articles?"))return response([{id:"11111111-1111-4111-8111-111111111111",public_id:"CERCO-INFO-000001",slug:"prueba",title:"Prueba",summary:"Resumen",status:"published",published_version_id:"22222222-2222-4222-8222-222222222222"}]);
  if(u.includes("/rest/v1/article_versions?"))return response([{version_number:1,content_json:{content_html:"<p>Texto.</p>"}}]);
  if(u.includes("/rest/v1/article_asset_links?"))return response([{id:"approved",section_key:"body",sort_order:0,display_mode:"wide",media_file:{id:"media1",bucket_id:"serco-publicaciones",storage_path:"biblioteca/diagrama.png",original_name:"diagrama.png",mime_type:"image/png",rights_status:"verified",alt_text:"Diagrama"}},{id:"unverified",media_file:{id:"media2",bucket_id:"serco-publicaciones",storage_path:"biblioteca/no.png",original_name:"no.png",mime_type:"image/png",rights_status:"unverified"}}]);
  if(u.includes("/storage/v1/object/sign/"))return response({signedURL:"/object/sign/serco-publicaciones/biblioteca/diagrama.png?token=test"});
  if(u.includes("/rest/v1/"))return response([]);throw new Error("Unexpected fetch "+u)};
 try{delete require.cache[require.resolve("../api/publication")];const handler=require("../api/publication"),req={method:"GET",query:{public_id:"CERCO-INFO-000001"}},res={setHeader(){},status(n){this.statusCode=n;return this},json(v){this.payload=v;return this}};await handler(req,res);assert.equal(res.statusCode,200);assert.equal(res.payload.asset_links.length,1);assert.equal(res.payload.asset_links[0].media_file.rights_status,"verified");assert.match(res.payload.asset_links[0].media_file.url,/storage\\/v1\\/object\\/sign/);assert.equal(calls.some(u=>u.includes("no.png")),false)}finally{global.fetch=originalFetch;delete require.cache[require.resolve("../api/publication")]}
});
test("la plantilla pública incorpora jerarquía editorial, recursos y referencias",()=>{
 const fs=require("node:fs"),path=require("node:path"),html=fs.readFileSync(path.join(__dirname,"../publication.html"),"utf8");
 for(const marker of ["article class=\"paper\"","class=\"article\"","class=\"grid\"","Fuentes y referencias","Publicaciones relacionadas","video.controls=true","loading=\"lazy\""])assert.ok(html.includes(marker),"Falta soporte: "+marker);
});
