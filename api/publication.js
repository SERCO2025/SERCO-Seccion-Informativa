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
 if(asset.bucket_id==="serco-media"){
  const path=asset.storage_path.split("/").map(encodeURIComponent).join("/");
  return {...asset,url:BASE+"/storage/v1/object/public/"+encodeURIComponent(asset.bucket_id)+"/"+path};
 }
 if(asset.bucket_id!=="serco-publicaciones")return {...asset,url:null};
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
  if(id&&!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:{code:"INVALID_ID",message:"El UUID no tiene un formato válido."}});
  if(publicId&&!/^CERCO-INFO-[0-9]+$/i.test(publicId))return res.status(400).json({error:{code:"INVALID_PUBLIC_ID",message:"El identificador CERCO-INFO no tiene un formato válido."}});
  const safeQuery=query.replace(/[,*()]/g," ").replace(/\s+/g," ").trim();
  let filter=id?"id=eq."+encodeURIComponent(id):publicId?"public_id=eq."+encodeURIComponent(publicId):"title=ilike.*"+encodeURIComponent(safeQuery)+"*";
  const articles=await rest("/rest/v1/articles?select=id,public_id,slug,title,summary,status,content_type,author_name,origin,specialty,created_at,updated_at,published_version_id&status=eq.published&published_version_id=not.is.null&"+filter+"&order=updated_at.desc&limit="+(query?10:1));
  if(!articles.length)return res.status(404).json({error:{code:"PUBLICATION_NOT_FOUND",message:"No se encontró una publicación vigente con esos datos."}});
  if(query&&!id&&!publicId)return res.status(200).json({results:articles.map(a=>({id:a.id,public_id:a.public_id,slug:a.slug,title:a.title,summary:a.summary,specialty:a.specialty}))});
  const article=articles[0];
  const [versions,sources,assets,categories,tags,relations,assetLinks]=await Promise.all([
   rest("/rest/v1/article_versions?select=version_number,content_json,created_at&id=eq."+encodeURIComponent(article.published_version_id)+"&article_id=eq."+encodeURIComponent(article.id)+"&limit=1"),
   rest("/rest/v1/article_sources?select=title,source_type,source_url,author,published_date&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_assets?select=id,bucket_id,storage_path,original_name,mime_type,alt_text,description,source_url,author,license,keywords,category,captured_at&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_categories?select=is_primary,category:categories(name,slug)&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_tags?select=tag:tags(name,slug)&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_relations?select=relation_type,related:articles!article_relations_related_article_id_fkey(public_id,title,slug,status)&article_id=eq."+encodeURIComponent(article.id)),
   rest("/rest/v1/article_asset_links?select=id,section_key,sort_order,alt_text_override,caption,display_mode,media_file:media_files(id,bucket_id,storage_path,original_name,mime_type,media_type,alt_text,description,source_url,author,license,keywords,category,rights_status)&article_id=eq."+encodeURIComponent(article.id)+"&order=section_key.asc,sort_order.asc")
  ]);
  const version=versions[0];
  if(!version)return res.status(404).json({error:{code:"PUBLISHED_VERSION_NOT_FOUND",message:"La versión publicada no está disponible."}});
  const publicAssets=await Promise.all(assets.map(signedAsset));
  const approvedLinks=assetLinks.filter(link=>link.media_file&&["verified","permission_granted","public_domain"].includes(link.media_file.rights_status));
  const publicAssetLinks=await Promise.all(approvedLinks.map(async link=>({...link,media_file:await signedAsset(link.media_file)})));
  const publicContent=version.content_json&&typeof version.content_json==="object"?{...version.content_json}:version.content_json;
  const conceptSourceUrls=new Set(sources.map(source=>source.source_url).filter(Boolean));
  const rawConcepts=publicContent&&publicContent.editorial_metadata&&Array.isArray(publicContent.editorial_metadata.concepts)?publicContent.editorial_metadata.concepts:[];
  const conceptKeys=new Set(rawConcepts.filter(item=>item&&typeof item.key==="string"&&/^[a-z0-9-]{1,80}$/.test(item.key)).map(item=>item.key));
  const publicConcepts=rawConcepts.filter(item=>item&&typeof item.key==="string"&&/^[a-z0-9-]{1,80}$/.test(item.key)&&typeof item.term==="string"&&item.term.trim().length>0&&item.term.length<=100&&typeof item.definition==="string"&&item.definition.trim().length>=30&&item.definition.length<=1200&&conceptSourceUrls.has(item.source_url)).map(item=>({key:item.key,term:item.term,definition:item.definition,source_url:item.source_url,related_keys:Array.isArray(item.related_keys)?item.related_keys.filter(key=>conceptKeys.has(key)&&key!==item.key).slice(0,12):[]}));
  if(publicContent&&publicContent.editorial_metadata&&typeof publicContent.editorial_metadata==="object"){publicContent.editorial_metadata={...publicContent.editorial_metadata};delete publicContent.editorial_metadata.concepts;}
  if(publicContent&&publicContent.editorial_metadata&&typeof publicContent.editorial_metadata==="object"){
   publicContent.editorial_metadata={...publicContent.editorial_metadata};
   delete publicContent.editorial_metadata.internal_research_report;
  }
  return res.status(200).json({
   publication:{id:article.id,public_id:article.public_id,slug:article.slug,title:article.title,summary:article.summary,
    content_type:article.content_type,author:article.author_name,origin:article.origin,specialty:article.specialty,
    version:version.version_number,updated_at:article.updated_at,content:publicContent},
   sources,categories:categories.map(x=>({...x.category,is_primary:x.is_primary})),tags:tags.map(x=>x.tag),assets:publicAssets,asset_links:publicAssetLinks,concepts:publicConcepts,
   relations:relations.filter(x=>x.related&&x.related.status==="published")
  });
 }catch{
  return res.status(502).json({error:{code:"PUBLICATION_LOOKUP_FAILED",message:"No fue posible recuperar el documento en este momento."}});
 }
};
