# Recuperador de conocimiento SERCO — primera integración

## Alcance

Se incorpora el núcleo físico mínimo para recuperar contenido publicado: artículos, versiones y fragmentos. Las tablas existentes de galería (media_files, gallery_items) y configuración (site_settings) no se modifican.

## Modelo creado

- articles: identidad editorial, slug, título, estado y versión publicada.
- article_versions: versiones inmutables por número, con contenido estructurado y texto de búsqueda.
- content_chunks: fragmentos vinculados a una versión, encabezado, texto y vector de búsqueda de texto completo.

La búsqueda usa PostgreSQL Full Text Search en español, normalización de acentos con unaccent, índice GIN y ranking ts_rank_cd. No instala ni utiliza pgvector.

## Seguridad

- RLS habilitado en las tres tablas.
- Las políticas públicas solo permiten filas de publicaciones publicadas y su versión vigente.
- La lectura de las tablas se concede al rol de backend service_role; no se conceden escrituras ni lectura directa a anon o authenticated.
- La función RPC search_published_chunks es SECURITY INVOKER y su ejecución se concede solo a service_role.
- El recuperador usa SUPABASE_URL y SUPABASE_SECRET_KEY exclusivamente en servidor.
- La consulta RPC filtra siempre por status = published y published_version_id = version.id; nunca devuelve borradores ni versiones antiguas.
- El endpoint no ejecuta una búsqueda hasta que también estén conectados el evaluador de cobertura y el control de seguridad.

## Contrato del adaptador

createSupabaseKnowledgeRetriever().search({ query, limit, publicationStatus: "published" })

Devuelve { items } con el contrato que valida el orquestador RAG: id, articleId, slug, title, version, section, content y excerpt.

El límite se restringe a 8 fragmentos. La función SQL no devuelve documentos si la consulta no produce términos de búsqueda.

## Integración en el servidor

api/ask.js inyecta el recuperador Supabase y el generador secuencial Gemini → Groq → Cloudflare en el orquestador. La ruta permanece en SERVICE_NOT_READY porque todavía no existen los adaptadores de evaluación de cobertura y seguridad. El orquestador verifica esos componentes antes de consultar Supabase, por lo que no se hacen consultas innecesarias ni llamadas a proveedores IA.

## Variables requeridas en el entorno servidor

- SUPABASE_URL
- SUPABASE_SECRET_KEY (clave secreta de backend; nunca usar en frontend)

## Verificación

- Pruebas unitarias del adaptador.
- Consulta SQL transaccional con datos ficticios para verificar acentos, ranking y selección exclusiva de la versión publicada; los datos de prueba se revierten.
- Supabase Security y Performance Advisors después del cambio.
