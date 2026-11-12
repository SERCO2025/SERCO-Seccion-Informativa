# Índice maestro — SERCO Sección Informativa

## Fuente oficial de datos
Supabase: proyecto `SERCO's Project` (`hlwxgetogjvieejcmttf`). La base de datos y el bucket `serco-publicaciones` son la fuente operativa oficial. GitHub conserva el código, las migraciones y este inventario; no es una segunda biblioteca editorial.

## Identidad y ciclo documental
- `public.articles`: identidad, identificador público permanente, estado, autor, origen, especialidad y metadatos.
- `public.article_versions`: versiones inmutables del documento; `content_json` conserva el documento íntegro.
- `public.content_chunks`: fragmentos derivados para recuperación; no reemplazan el documento completo.
- RPC `public.save_article_bundle(uuid,jsonb,jsonb)`: persistencia transaccional de documento, versión, fragmentos y relaciones editoriales.

## Clasificación y relaciones
- `public.categories`: catálogo de categorías.
- `public.article_categories`: relación N:M publicación-categoría.
- `public.tags`: catálogo de etiquetas.
- `public.article_tags`: relación N:M publicación-etiqueta.
- `public.article_relations`: relaciones entre publicaciones por UUID y tipo.

## Evidencia y recursos
- `public.article_sources`: referencias bibliográficas y fuentes originales.
- `public.article_assets`: metadatos de imágenes y documentos.
- Bucket privado `serco-publicaciones`: archivos de la Sección Informativa.
- Bucket `serco-media`: biblioteca corporativa preexistente; permanece independiente y sin cambios.

## API del editor
- `editor-login.html`: pantalla pública de inicio de sesión (sin funciones editoriales).\n- `api/editor-auth.js`: inicio de sesión, verificación y cierre de sesión de la cuenta autorizada; sesión en cookie HttpOnly.\n- `api/editor-page.js`: entrega la interfaz únicamente después de validar la cookie y el correo administrador.\n- `src/private/dashboard.html`: plantilla privada del editor; no se sirve como archivo estático.
- `api/editor.js`: catálogo administrativo, recuperación documental y guardado transaccional.\n- `src/services/editor/article-persistence.js`: servicio compartido de persistencia y validación para publicaciones manuales e investigaciones IA.
- `api/editor-upload.js`: emisión de URL firmada para cargas autenticadas al bucket privado.\n- `api/publication.js`: recuperación pública del documento íntegro por UUID, ID CERCO-INFO o título; solo versiones publicadas y enlaces temporales a archivos privados.\n- `vercel.json`: reescribe `/dashboard.html` hacia `api/editor-page.js` y empaqueta la plantilla privada.
- `api/ask.js`: consultas públicas a la base de conocimiento.
- `api/research-public.js`: investigación externa pública con límites de uso.
- `api/research.js`: investigación restringida.

## Servicios existentes
- `src/services/knowledge/supabase-knowledge-retriever.js`: recuperación desde Supabase.
- `src/services/ai/ask-orchestrator.js`: coordinación de consultas.
- `src/services/research/`: búsqueda Tavily y análisis Gemini.
- `src/services/security/`: controles de uso de API.

## Migraciones
- `supabase/migrations/20261109092855_create_knowledge_retrieval_core.sql`: publicaciones, versiones y fragmentos.
- `supabase/migrations/20261109092925_index_knowledge_foreign_keys.sql`: índices de claves foráneas.
- `supabase/migrations/20261109092946_restrict_knowledge_tables_to_backend.sql`: acceso restringido al backend.
- `supabase/migrations/20261109123300_public_api_rate_limits.sql` y `20261109124000_public_api_rate_limit_order.sql`: límites de consultas públicas.
- `supabase/migrations/20261112144735_serco_editorial_content_model_and_atomic_save.sql`: modelo editorial, bucket privado y operación transaccional.\n- `supabase/migrations/20261112145352_extend_published_search_with_public_ids_and_sources.sql`: ID público y fuentes originales en resultados de búsqueda.\n- `supabase/migrations/20261112145528_require_asset_source_and_keywords.sql`: trazabilidad obligatoria de recursos multimedia.\n- `supabase/migrations/20261112145942_revoke_public_execution_from_rls_auto_enable.sql`: revoca ejecución directa del helper RLS a roles públicos; conserva el objeto para administración.

## Variables de entorno requeridas en Vercel
- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: clave publicable del proyecto (solo identificador público).
- `SUPABASE_SECRET_KEY`: clave secreta de servidor; nunca se coloca en el navegador ni en Git.
- `SERCO_ADMIN_EMAIL`: correo exacto autorizado para administrar la biblioteca.
- `GEMINI_API_KEY` y `TAVILY_API_KEY`: proveedores de investigación, si no están ya configurados.

## Guía operativa\n- `docs/CONFIGURACION_ENTORNO_EDITORIAL.md`: variables requeridas, configuración del administrador, entorno Vercel y pruebas de activación.\n\n## Reglas de integridad
1. Una publicación tiene un único documento íntegro y puede relacionarse con varias categorías y etiquetas sin duplicarse.
2. Cada guardado crea una versión nueva y genera fragmentos asociados a esa versión.
3. Solo la versión publicada se expone a la recuperación pública.
4. Las tablas editoriales y el bucket de recursos no permiten acceso anónimo directo.
5. Las claves secretas solo se usan desde funciones de servidor.
6. Los archivos de la biblioteca corporativa `serco-media` no se mueven ni se reutilizan para esta biblioteca.

## Estado de integración
La migración y las tablas están creadas en Supabase. Las rutas API administrativas, la pantalla de acceso, la entrega privada del editor y la conexión del frontend están añadidas a `desarrollo`. La carga con URL firmada está implementada en el código. Las investigaciones externas se registran mediante el mismo servicio documental y quedan en revisión editorial; no se publican automáticamente hasta validar el ciclo completo. La conexión operativa aún requiere la clave secreta del servidor y el correo de administrador en Vercel, además de pruebas de extremo a extremo.
