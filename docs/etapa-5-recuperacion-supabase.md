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

## Contrato del adaptador

createSupabaseKnowledgeRetriever().search({ query, limit, publicationStatus: "published" })

Devuelve { items } con el contrato que valida el orquestador RAG: id, articleId, slug, title, version, section, content y excerpt.

El límite se restringe a 8 fragmentos. La función SQL no devuelve documentos si la consulta no produce términos de búsqueda.

## Estado de integración

El adaptador tiene pruebas unitarias con respuestas HTTP simuladas. La migración SQL se aplica al proyecto Supabase existente de SERCO. La ruta pública /api/ask permanece deshabilitada hasta implementar y conectar el evaluador de cobertura y el control de seguridad; no se habilita una respuesta pública parcial ni se consumen proveedores IA durante esta fase.

## Variables requeridas en el entorno servidor

- SUPABASE_URL
- SUPABASE_SECRET_KEY (clave secreta de backend; nunca usar en frontend)

## Verificación

- Pruebas unitarias del adaptador.
- Consulta SQL directa de la función RPC después de aplicar la migración.
- Supabase Security y Performance Advisors después del cambio.
