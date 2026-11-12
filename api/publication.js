"use strict";

const BASE=(process.env.SUPABASE_URL||"").replace(/\/+$/,"");
const SECRET=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||"";
async function rest(path){
 const response=await fetch(BASE+path,{headers:{apikey:SECRET,Authorization:"Bearer "+SECRET}});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new Error("PUBLICATION_LOOKUP_FAILED");
 return data;
}
async function signedAsset(asset){
 const response=await fetch(BASE+"/storage/v1/object/sign/"+encodeURIComponent(asset.bucket_id)+"/"+asset.storage_path.split("/").map(encodeURIComponent).join("/"),{
  method:"POST",headers:{apikey:SECRET,Authorization:"Bearer "+SECRET,"Content-Type":"application/json"},
  body:JSON.stringify({expiresIn:3600})
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.signedURL)return {...asset,url:null};
 const url=data.signedURL.startsWith("http")?data.signedURL:BASE+"/storage/v1"+data.signedURL;
 return {...asset,url};
}
module.exports=async function publicPublication(req,res){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:{code:"METHOD_NOT_ALLOWED",message:"Usa GET."}});}
 if(!BASE||!SECRET)return res.status(503).json({error:{code:"PUBLICATION_SERVICE_NOT_READY",message:"El catálogo público no está configurado."}});
 try{
  const id=typeof req.query?.id==="string"?req.query.id:"";
  const publicId=typeof req.query?.public_id==="string"?req.query.public_id:"";
  const query=typeof req.query?.q==="string"?req.query.q.trim():"";
  if(!id&&!publicId&&!query)return res.status(400).json({error:{code:"MISSING_LOOKUP",message:"Indica el ID, public_id o q para buscar una publicación."}});
  if(query.length>160)return res.status(400).json({error:{code:"INVALID_QUERY",message:"La búsqueda supera el límite permitido."}});
  let filter=id?"id=eq."+encodeURIComponent(id):publicId?"public_id=eq."+encodeURIComponent(publicId):"title=ilike.*"+encodeURIComponent(query)+"*";
  const articles=await rest("/rest/v1/articles?select=id,public_id,slug,title,summary,status,content_type,author_name,origin,specialty,created_at,updated_at,published_version_id&status=eq.published&published_version_id=not.is.null&"+filter+"&order=updated_at.desc&limit="+(query?10:1));
  if(!articles.length)return res.status(404).json({error:{code:"PUBLICATION_NOT_FOUND",message:"No se encontró una publicación vigente con esos datos."}});
  if(query&&!id&&!publicId)return res.status(200).json({results:articles.map(a=>({id:a.id,public_id:a.public_id,slug:a.slug,title:a.title,summary:a.summary,specialty:a.specialty}))});
  const article=articles[0];
  const [versions,sources,assets,categories,tags,relations]=await Promise.all([
   rest("/rest/v1/article_versions?select=version_number,content_json,created_at&id=eq."+encodeURIComponent(article.published_version_id)+"&article_id=eq."+encodeURIComponent(article.id)+"&limit=1"),
   rest("/rest/v1/article_sources?select=title,source_type,source_url,author,published_date&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_assets?select=id,bucket_id,storage_path,original_name,mime_type,alt_text,description,source_url,author,license,keywords,category,captured_at&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_categories?select=category:categories(name,slug,is_primary)&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_tags?select=tag:tags(name,slug)&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_relations?select=relation_type,related:articles!article_relations_related_article_id_fkey(public_id,title,slug,status)&article_id=eq."+encodeURIComponent(article.id))
  ]);
  const version=versions[0];
  if(!version)return res.status(404).json({error:{code:"PUBLISHED_VERSION_NOT_FOUND",message:"La versión publicada no está disponible."}});
  const publicAssets=await Promise.all(assets.map(signedAsset));
  return res.status(200).json({
   publication:{id:article.id,public_id:article.public_id,slug:article.slug,title:article.title,summary:article.summary,
    content_type:article.content_type,author:article.author_name,origin:article.origin,specialty:article.specialty,
    version:version.version_number,updated_at:article.updated_at,content:version.content_json},
   sources,categories:categories.map(x=>x.category),tags:tags.map(x=>x.tag),assets:publicAssets,
   relations:relations.filter(x=>x.related&&x.related.status==="published")
  });
 }catch{
  return res.status(502).json({error:{code:"PUBLICATION_LOOKUP_FAILED",message:"No fue posible recuperar el documento en este momento."}});
 }
};
