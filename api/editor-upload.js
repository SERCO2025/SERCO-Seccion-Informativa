"use strict";

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAIL = (process.env.SERCO_ADMIN_EMAIL || "").trim().toLowerCase();
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg","image/png","image/webp","image/gif","application/pdf"]);

function send(res,status,payload){res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.status(status).json(payload);}
function bodyOf(req){if(req.body&&typeof req.body==="object")return req.body;if(typeof req.body==="string"){try{return JSON.parse(req.body)}catch{}}return{};}
module.exports=async function editorUpload(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return send(res,405,{error:{code:"METHOD_NOT_ALLOWED",message:"Usa POST."}});}
 if(!BASE||!PUBLIC_KEY||!SECRET_KEY||!ADMIN_EMAIL)return send(res,503,{error:{code:"EDITOR_BACKEND_NOT_CONFIGURED",message:"Falta configurar el backend editorial."}});
 const authorization=req.headers&&req.headers.authorization||"",token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(!token)return send(res,401,{error:{code:"UNAUTHORIZED",message:"Se requiere sesión administrativa."}});
 try{
  const auth=await fetch(BASE+"/auth/v1/user",{headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+token}});
  const user=await auth.json().catch(()=>({}));
  if(!auth.ok||String(user.email||"").toLowerCase()!==ADMIN_EMAIL)return send(res,401,{error:{code:"UNAUTHORIZED",message:"La sesión no está autorizada."}});
  const body=bodyOf(req);
  const name=String(body.name||"").trim().replace(/[\\/\\\\]/g,"_").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,150);
  const mime=String(body.mime_type||"").toLowerCase();
  const size=Number(body.size_bytes||0);
  const articleId=String(body.article_id||"").trim();
  if(!name||!articleId||!Number.isFinite(size)||size<=0||size>MAX_FILE_BYTES||!ALLOWED.has(mime))
    return send(res,422,{error:{code:"INVALID_FILE",message:"Archivo no permitido. Admite JPG, PNG, WEBP, GIF o PDF hasta 25 MB."}});
  const path="publicaciones/"+articleId+"/recursos/"+Date.now()+"-"+name;
  const signed=await fetch(BASE+"/storage/v1/object/upload/sign/serco-publicaciones/"+path,{
   method:"POST",headers:{apikey:SECRET_KEY,Authorization:"Bearer "+SECRET_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({})
  });
  const result=await signed.json().catch(()=>({}));
  if(!signed.ok||!result.url)return send(res,502,{error:{code:"UPLOAD_URL_FAILED",message:"No se pudo preparar la carga segura del archivo."}});
  const signedUrl=/^https?:\\/\\//i.test(result.url)?result.url:(BASE+"/storage/v1"+(result.url.startsWith("/")?result.url:"/"+result.url));
  return send(res,200,{bucket_id:"serco-publicaciones",storage_path:path,signed_url:signedUrl,token:new URL(signedUrl).searchParams.get("token"),original_name:name,mime_type:mime,size_bytes:size});
 }catch{
  return send(res,502,{error:{code:"UPLOAD_PREPARE_FAILED",message:"No fue posible preparar la carga del archivo."}});
 }
};
