"use strict";

const { randomUUID } = require("node:crypto");
const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function stripHtml(value) {
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">").replace(/\s+/g," ").trim();
}
function sanitizeHtml(html) {
  let value=String(html||"").slice(0,500000).replace(/<!--[\s\S]*?-->/g,"");
  value=value.replace(/<(script|style|iframe|object|embed|form|input|button|meta|link|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,"");
  value=value.replace(/<(script|style|iframe|object|embed|form|input|button|meta|link|svg|math)\b[^>]*\/?>/gi,"");
  const allowed=new Set(["p","br","h1","h2","h3","h4","h5","h6","strong","b","em","i","u","ul","ol","li","blockquote","table","thead","tbody","tfoot","tr","th","td","a","hr","figure","figcaption","img"]);
  return value.replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi,(whole,rawTag,rawAttrs)=>{
    const tag=rawTag.toLowerCase();if(!allowed.has(tag))return "";
    if(whole.startsWith("</"))return "</"+tag+">";
    let attrs="";
    if(tag==="a"){const match=rawAttrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);const url=match&&(match[1]||match[2]||match[3]||"");if(url&&/^(https?:\/\/|mailto:)/i.test(url))attrs+=' href="'+url.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" rel="noopener noreferrer"';}
    if(tag==="img"){const match=rawAttrs.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);const alt=rawAttrs.match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i);const url=match&&(match[1]||match[2]||match[3]||"");if(!url||!/^https:\/\//i.test(url))return "";attrs+=' src="'+url.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'"';if(alt)attrs+=' alt="'+(alt[1]||alt[2]||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'"';attrs+=' loading="lazy"';}
    if(tag==="th"||tag==="td"){const colspan=rawAttrs.match(/\bcolspan\s*=\s*["']?([1-9][0-9]?)["']?/i);const rowspan=rawAttrs.match(/\browspan\s*=\s*["']?([1-9][0-9]?)["']?/i);if(colspan)attrs+=' colspan="'+colspan[1]+'"';if(rowspan)attrs+=' rowspan="'+rowspan[1]+'"';}
    return "<"+tag+attrs+">";
  });
}
function makeChunks(html,text) {
  const matches=String(html||"").match(/<(h[1-6])[^>]*>[\s\S]*?<\/\1>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>|<blockquote[^>]*>[\s\S]*?<\/blockquote>|<tr[^>]*>[\s\S]*?<\/tr>/gi)||[];
  const chunks=[];let heading=null,current="";
  const flush=()=>{if(current.trim())chunks.push({chunk_index:chunks.length,heading,content:current.trim(),metadata:{}});current="";};
  for(const part of matches){const h=part.match(/^<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>$/i);if(h){flush();heading=stripHtml(h[1]);continue;}const plain=stripHtml(part);if(!plain)continue;if(current.length+plain.length>1600)flush();current+=(current?"\n\n":"")+plain;}
  flush();
  if(!chunks.length&&text){for(let i=0;i<text.length;i+=1400)chunks.push({chunk_index:chunks.length,heading:null,content:text.slice(i,i+1400),metadata:{}});}
  return chunks;
}
function normalizeUrl(value) {
  const url=String(value||"").trim();
  if(/^doi:/i.test(url))return "https://doi.org/"+url.replace(/^doi:/i,"").trim();
  if(/^ISBN:/i.test(url))return "https://openlibrary.org/isbn/"+url.replace(/^ISBN:/i,"").replace(/[^0-9X]/gi,"");
  if(/^ISSN:/i.test(url))return "https://portal.issn.org/resource/ISSN/"+url.replace(/^ISSN:/i,"").trim();
  return url;
}
function slugify(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}

function createArticlePersistence(options={}) {
  const url=(options.url||BASE).replace(/\/+$/,"");
  const secret=options.secretKey||SECRET_KEY;
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  return {
    async save({articleId=null,document,userId=null}={}) {
      if(!url||!secret||typeof fetchImpl!=="function")throw new Error("PERSISTENCE_NOT_CONFIGURED");
      if(!document||typeof document!=="object")throw new Error("INVALID_DOCUMENT");
      const contentHtml=sanitizeHtml(document.content_html||"");
      const contentText=stripHtml(contentHtml);
      const title=String(document.title||"").trim();
      const summary=String(document.summary||"").trim();
      const authorName=String(document.author_name||document.author||"").trim();
      const specialty=String(document.specialty||"").trim();
      const categories=[...new Set((Array.isArray(document.categories)?document.categories:[]).map(x=>String(x||"").trim()).filter(Boolean))];
      if(specialty&&!categories.some(x=>x.toLowerCase()===specialty.toLowerCase()))categories.unshift(specialty);
      const sources=(Array.isArray(document.sources)?document.sources:[]).map(s=>({
        title:String(s.title||"").trim(),source_type:s.source_type||s.type||"website",
        source_url:normalizeUrl(s.source_url||s.url),author:s.author||null,
        published_date:s.published_date||s.date||null,metadata:s.metadata||{}
      }));
      if(title.length<5||summary.length<30||contentText.length<80||!authorName||!specialty||!categories.length||!sources.length)
        throw new Error("VALIDATION: Completa título, resumen, contenido, responsable, especialidad, categorías y fuentes.");
      if(sources.some(s=>!s.title||!/^https?:\/\//i.test(s.source_url)))
        throw new Error("VALIDATION: Cada fuente requiere título y URL HTTP/HTTPS verificable.");
      const status=document.status||"draft";
      if(!["draft","review","approved","published","archived"].includes(status))throw new Error("VALIDATION: Estado editorial no válido.");
      const assets=Array.isArray(document.assets)?document.assets:[];
      for(const asset of assets){const keywords=Array.isArray(asset.keywords)?asset.keywords:[];if(!asset.storage_path||!asset.original_name||!asset.alt_text||!asset.description||!asset.license||!/^https?:\/\//i.test(String(asset.source_url||""))||!keywords.length)throw new Error("VALIDATION: Cada recurso requiere archivo, texto alternativo, descripción, fuente HTTP/HTTPS, licencia y palabras clave.");}
      const slug=String(document.slug||"").trim()||slugify(title)+"-"+(articleId?String(articleId).slice(0,8):randomUUID().slice(0,8));
      const normalized={
        ...document,slug,title,summary,content_html:contentHtml,content_text:contentText,
        author_name:authorName,specialty,categories,sources,assets,
        tags:Array.isArray(document.tags)?document.tags:[],
        relations:Array.isArray(document.relations)?document.relations:[],
        origin:document.origin||"manual",status,created_by:userId||document.created_by||null,
        ai_retrieval_enabled:document.ai_retrieval_enabled!==false,
        search_metadata:document.search_metadata||{},
        editorial_metadata:document.editorial_metadata||{}
      };
      const chunks=makeChunks(contentHtml,contentText);
      if(!chunks.length)throw new Error("VALIDATION: No se generaron fragmentos para la búsqueda.");
      const response=await fetchImpl(url+"/rest/v1/rpc/save_article_bundle",{
        method:"POST",
        headers:{apikey:secret,Authorization:"Bearer "+secret,"Content-Type":"application/json"},
        body:JSON.stringify({p_article_id:articleId,p_document:normalized,p_chunks:chunks})
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(payload&&payload.message||payload&&payload.details||"PERSISTENCE_FAILED");
      return {saved:payload,chunk_count:chunks.length};
    }
  };
}
module.exports={createArticlePersistence,sanitizeHtml,stripHtml,makeChunks,normalizeUrl};
