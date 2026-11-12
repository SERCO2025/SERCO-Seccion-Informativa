# Configuración del entorno — Editor SERCO

## Proyecto de despliegue
- Vercel project: `seccion-informativa`
- Team: `Luca Team`
- Repositorio: `SERCO2025/SERCO-Seccion-Informativa`
- Rama conectada: `desarrollo`
- El proyecto actualmente clasifica los despliegues de esa rama como `Production`. No cambiar esta asociación sin autorización explícita.
- Variables públicas de Supabase ya registradas en Vercel para Production: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.

## Variables obligatorias
Configurar en Vercel → Project → Settings → Environment Variables. Mantener todas las credenciales privadas fuera de GitHub y del navegador.

| Variable | Tipo | Uso |
|---|---|---|
| `SUPABASE_URL` | Plain | URL del proyecto Supabase. Ya configurada. |
| `SUPABASE_PUBLISHABLE_KEY` | Plain | Clave publicable. Ya configurada. |
| `SUPABASE_SECRET_KEY` | Sensitive | Clave secreta de servidor para consultas, persistencia, límites de uso y Storage. Nunca usar en frontend. |
| `SERCO_ADMIN_EMAIL` | Plain | Correo exacto autorizado para el editor privado. Debe existir y estar confirmado en Supabase Auth. |
| `GEMINI_API_KEY` | Sensitive | Análisis de investigaciones externas. |
| `TAVILY_API_KEY` | Sensitive | Búsqueda y recuperación de fuentes web. |

## Entorno de Vercel
El proyecto está configurado actualmente para desplegar `desarrollo` como Production. Por eso las variables requeridas deben estar disponibles en Production. Vercel rechaza una variable Preview vinculada a `desarrollo` cuando esa rama es la Production Branch.

No cambiar Production Branch, no promover otras ramas y no desplegar `main` como parte de esta configuración.

## Crear la cuenta administradora
1. Crear o confirmar el usuario en Supabase → Authentication → Users.
2. Confirmar el correo electrónico de esa cuenta.
3. Registrar el mismo correo, respetando su dirección, en `SERCO_ADMIN_EMAIL`.
4. El endpoint de inicio de sesión compara el correo autenticado contra esta variable. No basta con que una cuenta exista en Supabase.

## Activación
Después de guardar las variables:
1. Generar un nuevo deployment de la rama `desarrollo` para que Vercel inyecte los valores.
2. Probar inicio y cierre de sesión.
3. Probar acceso anónimo a `/dashboard.html` (debe redirigir a `/editor-login.html`).
4. Probar creación, edición, versión, fuentes, categorías, etiquetas, carga de archivos y recuperación por ID.
5. Probar que el endpoint público solo devuelva documentos con estado `published`.
6. Probar investigación externa: debe registrar el informe como `review`, con sus fuentes y fragmentos; no publicar automáticamente hasta aprobar el ciclo de validación.

## Seguridad
- No copiar `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY` ni `TAVILY_API_KEY) a archivos del repositorio.
- No poner claves secretas en `index.html`, `editor-login.html` ni `src/private/dashboard.html`.
- El bucket `serco-publicaciones` es privado. Los archivos públicos se entregan mediante URLs firmadas y solo si pertenecen a una publicación vigente.
- El bucket corporativo `serco-media` permanece separado.
