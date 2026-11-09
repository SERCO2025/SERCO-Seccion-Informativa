# Etapa 5 — evaluación de cobertura y control de seguridad

## Componentes conectados

- `createEvidenceCoverageEvaluator`: normaliza acentos, elimina palabras funcionales y compara términos relevantes de la pregunta con título, sección y contenido de las evidencias recuperadas.
- Clasifica como `sufficient` cuando todos los términos relevantes aparecen respaldados léxicamente; como `partial` cuando existe coincidencia parcial (25 % o más); y como `insufficient` cuando la coincidencia es menor o no hay términos verificables.
- Devuelve los términos coincidentes y una descripción de los términos sin respaldo. Esa información ahora se transmite al generador, para que la respuesta parcial identifique explícitamente lo que falta.
- `createConstructionSafetyGuard`: permite consultas informativas generales y solicita contexto cuando detecta una petición de decisión, diseño, cálculo o recomendación sobre elementos de alto impacto constructivo.
- Las aclaraciones solicitan ubicación/normativa, dimensiones y uso, terreno/cargas/apoyos, y materiales/especificaciones. No se bloquean definiciones generales.

## Límites conocidos y precauciones

El evaluador actual es un filtro léxico determinista inicial. La coincidencia de términos no demuestra por sí sola que la evidencia responda semánticamente la pregunta. Por tanto, no se considera calibrado ni certificado para producción. Antes de habilitar consultas públicas se debe probar con un corpus editorial real, incluir preguntas negativas y paráfrasis, medir falsos positivos/falsos negativos y ajustar umbrales. La respuesta final sigue restringida a la evidencia y sus citas verificadas.

El control de seguridad actual es basado en patrones de lenguaje, no un análisis profesional del proyecto. Es una barrera conservadora inicial; requiere ampliación y pruebas con consultas reales antes del lanzamiento. Las aclaraciones no sustituyen la revisión de un profesional responsable.

## Integración

`api/ask.js` ahora inyecta:
1. Recuperador Supabase de publicaciones vigentes.
2. Evaluador léxico de cobertura.
3. Control de seguridad constructiva.
4. Generador secuencial Gemini → Groq → Cloudflare Workers AI.

El orquestador transmite `missingInformation` al generador, que ya la incorpora al prompt de cobertura parcial.

## Estado operativo

La ruta ya no está bloqueada por adaptadores ausentes. Sin embargo, esto no significa que esté lista para exposición pública. Requiere configuración de variables de entorno del servidor (Supabase y proveedores), corpus editorial publicado y pruebas integrales. No se creó ni configuró el proyecto Vercel independiente, no se activó el endpoint en el sitio corporativo y no se modificó `main`.
