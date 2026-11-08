# SERCO AI — Informe técnico completo de la etapa 4
## Búsqueda y recuperación de conocimiento
**Fecha:** 8 de noviembre de 2026  
**Proyecto:** SERCO AI — Sección Informativa  
**Repositorio:** SERCO2025/SERCO-Seccion-Informativa  
**Estado:** diagnóstico, diseño de recuperación y pruebas preliminares completados; validación de calidad con corpus real e implementación productiva pendientes.

---

## 1. Objetivo de la etapa

Definir y comprobar cómo SERCO AI localizará conocimiento relevante dentro de la biblioteca editorial de SERCO. La búsqueda debe recuperar contenido aunque el visitante utilice una redacción distinta a la del artículo, sin confundir semejanza de palabras con equivalencia técnica.

La biblioteca SERCO debe seguir siendo la fuente primaria. La búsqueda externa de internet pertenece a otra etapa y no debe mezclarse con los resultados del conocimiento oficial.

Los objetivos técnicos son:
1. Recuperar por términos y expresiones en español.
2. Normalizar diferencias de escritura, acentos y variantes morfológicas.
3. Reconocer alias y sinónimos aprobados por SERCO.
4. Ordenar resultados por relevancia, dando más peso al título y a los conceptos.
5. Tolerar errores tipográficos sin degradar la precisión.
6. Preparar la arquitectura para búsqueda semántica únicamente si las pruebas reales demuestran que hace falta.
7. Devolver fragmentos trazables a una publicación y versión aprobadas.
8. No convertir un resultado parecido en una respuesta técnica válida sin comprobar cobertura.

## 2. Alcance y límites de la auditoría

La inspección fue de solo lectura. Se consultó el repositorio de la sección informativa y el proyecto Supabase ya identificado para SERCO. No se ejecutaron migraciones, no se instalaron extensiones, no se crearon tablas ni índices, no se modificaron archivos de la aplicación pública ni del panel.

Se revisaron:
- El prototipo público `index.html`.
- El prototipo administrativo `dashboard.html`.
- La rama documental `informacion-de-etapas`.
- El estado del esquema público de Supabase, previamente inventariado en la etapa 3.
- Las extensiones instaladas y disponibles.
- Las configuraciones de búsqueda de texto de PostgreSQL.
- Consultas SQL de prueba basadas en CTE y datos de ejemplo en memoria; no se insertó información en tablas.

## 3. Estado actual encontrado

### 3.1 Repositorio

El buscador actual de `index.html` utiliza un arreglo JavaScript local con tres fichas de demostración:
- ¿Qué es un vano?
- ¿Qué es un lindero?
- Cimentación para muros.

La búsqueda actual compara cadenas en minúsculas y busca coincidencias directas en título, etiquetas y resumen. No consulta Supabase, no busca fragmentos, no usa sinónimos gestionados, no calcula relevancia y no aplica búsqueda semántica.

El `dashboard.html` contiene campos de clasificación que anticipan ramas, temas, conceptos, palabras relacionadas y referencias, pero esos elementos son todavía parte del prototipo. No existe persistencia editorial conectada al modelo de datos diseñado.

### 3.2 Supabase y esquema

La etapa 3 dejó diseñado, pero todavía no implementado, el modelo de publicaciones y conocimiento. En la consulta de verificación no aparecieron las tablas:
- `articles`
- `article_versions`
- `content_chunks`
- `concepts`
- `concept_aliases`

Las tablas existentes pertenecen a la galería y configuración del sitio corporativo. No deben reutilizarse como biblioteca editorial de SERCO AI.

**Consecuencia:** todavía no hay un corpus real de artículos publicados ni fragmentos que permita medir precisión, cobertura, velocidad o calidad de ranking en condiciones reales.

## 4. Capacidades de PostgreSQL comprobadas

### 4.1 Configuración española

La base de datos dispone de las configuraciones de búsqueda de texto `spanish`, `simple` e `english`. La prueba con `spanish` convirtió “cimentaciones” y “cimentación” a una raíz común y encontró coincidencias entre singular y plural.

Prueba ejecutada:
- Texto de muestra: “Las cimentaciones transmiten las cargas del muro al terreno”.
- Consulta: “cimentación muro terreno”.
- Resultado: coincidencia positiva.

Esto confirma que el diccionario español nativo es una base funcional para recuperación morfológica en español.

### 4.2 Búsqueda de texto completo

Se comprobó el uso de:
- `to_tsvector('spanish', texto)` para convertir el contenido en lexemas.
- `websearch_to_tsquery('spanish', consulta)` para interpretar consultas escritas de manera natural.
- El operador `@@` para comprobar coincidencias.
- `ts_rank_cd` para calcular una puntuación de relevancia.
- `setweight` para dar prioridad distinta a campos como título y cuerpo.

La prueba con los términos “transmiten cargas terreno” sí encontró el texto de ejemplo correspondiente. La consulta natural más larga que incluía palabras adicionales no encontró resultado en la prueba inicial. Esto ilustra por qué la construcción de consultas debe tratar palabras funcionales, términos esenciales y cobertura con cuidado.

### 4.3 Índices

PostgreSQL admite índices GIN para columnas `tsvector`. El diseño recomendado es almacenar un vector de búsqueda por fragmento y crear un índice GIN sobre ese vector. No se creó el índice porque la tabla `content_chunks` todavía no existe.

No se midió rendimiento ni se ejecutó `EXPLAIN ANALYZE` sobre un corpus real. Por tanto, no se afirma que la búsqueda ya esté optimizada ni que tenga un tiempo de respuesta determinado.

## 5. Hallazgo importante: acentos

La prueba mostró un fallo reproducible en la configuración española nativa cuando se compara una forma acentuada con otra sin acento:
- Documento: “cimentación”.
- Consulta: “cimentacion”.
- Resultado: no coincide con la configuración probada.

El vector de la palabra acentuada produjo la raíz `ciment`; la palabra sin acento produjo `cimentacion`. La diferencia impide la coincidencia cruzada.

### Corrección recomendada

Incorporar normalización de diacríticos de forma coherente tanto al indexar como al procesar la consulta. PostgreSQL ofrece el diccionario `unaccent`, que puede encadenarse antes del diccionario de stemming español. El orden importa: primero retirar diacríticos y después aplicar el análisis morfológico español.

La extensión `unaccent` aparece disponible en el catálogo de extensiones de Supabase, pero la consulta de extensiones instaladas no la encontró instalada. No se activó durante esta etapa.

La normalización debe aplicarse de manera idéntica a:
- Título.
- Resumen.
- Encabezados.
- Texto de cada fragmento.
- Conceptos y alias.
- Consulta introducida por el visitante.

No se recomienda eliminar acentos únicamente en el navegador y dejar el índice almacenado con otra regla; ambas partes deben compartir el mismo proceso.

## 6. Sinónimos, alias y vocabulario SERCO

La prueba con la palabra “cimiento” no encontró automáticamente el documento que contenía “cimentación”. Esto es esperado: el stemming reconoce variantes morfológicas, pero no debe asumir equivalencia semántica entre palabras distintas.

La etapa 3 ya contempla `concepts` y `concept_aliases`. Se recomienda usar esas entidades como vocabulario controlado.

Ejemplo conceptual:
- Concepto canónico: Cimentación.
- Alias posibles: cimiento, fundación, base de apoyo.
- Rama y tema: Construcción / Cimentaciones.

La asociación de alias debe ser revisada editorialmente. No se deben registrar sinónimos globales a ciegas: una palabra puede cambiar de significado según la disciplina o el contexto.

Flujo recomendado:
1. Normalizar la consulta.
2. Buscar coincidencias con conceptos y alias aprobados.
3. Recuperar el concepto canónico y sus relaciones pertinentes.
4. Expandir la consulta con los términos aprobados.
5. Conservar el término original para trazabilidad y análisis.
6. Dar prioridad al concepto canónico y a coincidencias directas.
7. No interpretar una relación “relacionado con” como sinónimo.

## 7. Tolerancia a errores tipográficos

La extensión `pg_trgm` aparece disponible en Supabase, pero no instalada en el proyecto. Esta extensión calcula similitud a partir de grupos de tres caracteres y puede ayudar a encontrar palabras mal escritas o coincidencias parciales.

Se recomienda utilizarla como mecanismo auxiliar, no como sustituto del FTS:
- Primero: búsqueda de texto completo.
- Después: coincidencia por alias.
- En caso de pocos o ningún resultado: búsqueda aproximada controlada con trigramas.
- Limitar coincidencias de baja similitud para evitar ruido.
- Usar sugerencias de corrección en lugar de alterar silenciosamente la consulta.

No se ejecutó una prueba real de `pg_trgm` porque la extensión no está instalada. No se debe afirmar que la tolerancia a errores ya funciona.

## 8. Ranking y orden de resultados

Se comprobó en una CTE de datos de ejemplo que PostgreSQL permite ponderar el título por encima del cuerpo mediante `setweight` y ordenar con `ts_rank_cd`.

La estrategia propuesta para SERCO:
1. Coincidencia exacta del título o frase.
2. Coincidencia con concepto canónico.
3. Coincidencia en encabezado del fragmento.
4. Coincidencia en resumen.
5. Coincidencia en el cuerpo del fragmento.
6. Coincidencia aproximada por trigramas, con penalización.
7. Relaciones temáticas como señal secundaria, nunca como prueba suficiente.

Los pesos numéricos definitivos no se fijan en esta etapa. Deben calibrarse con un conjunto de consultas reales y resultados esperados. No conviene inventar un porcentaje de relevancia antes de tener ese conjunto de evaluación.

La consulta de prueba devolvió “Cimentación” para una búsqueda con “cimentación cargas terreno”. Su puntuación fue 0.1 en el conjunto mínimo de ejemplo. Ese número es ilustrativo y no constituye un umbral de producción.

## 9. Decisión sobre búsqueda semántica y pgvector

La búsqueda semántica permite recuperar contenido relacionado por significado aunque no comparta literalmente las mismas palabras. Sin embargo, requiere:
- Un corpus de contenido aprobado y fragmentado.
- Un modelo de embeddings elegido y versionado.
- Vectores generados de forma consistente.
- Índice vectorial.
- Pruebas de precisión y recuperación.
- Control de costos, latencia y cambios de modelo.

La extensión `vector` no apareció instalada en la consulta de extensiones del proyecto. No se instaló ni se creó ninguna columna vectorial.

**Decisión de esta etapa: no activar pgvector todavía.** No existe corpus SERCO que demuestre que la búsqueda semántica mejore de forma medible los resultados. Primero se debe implementar y evaluar FTS español, alias y trigramas. Después, si quedan consultas conceptuales que FTS no resuelva, se comparará la recuperación semántica y una fusión híbrida.

Si en una etapa posterior se justifica la combinación, se puede evaluar Reciprocal Rank Fusion (RRF), que combina posiciones de listas de resultados de métodos distintos sin asumir que sus puntuaciones están en la misma escala.

## 10. Arquitectura de recuperación recomendada

### Entrada
Recibir la pregunta original y conservarla sin alteración para auditoría y análisis de brechas.

### Preparación
- Validar longitud y caracteres.
- Normalizar mayúsculas/minúsculas y espacios.
- Aplicar normalización de acentos de forma consistente.
- Identificar palabras funcionales y términos principales.
- Detectar conceptos y alias aprobados.

### Recuperación
- Buscar fragmentos publicados con FTS español.
- Expandir mediante alias editoriales.
- Aplicar ranking ponderado.
- Activar trigramas como fallback controlado.
- Deduplicar por publicación y versión.
- Mantener relación entre fragmento, encabezado, artículo y versión.

### Evaluación de cobertura
La búsqueda devuelve candidatos; el motor de la etapa 5 decidirá si los fragmentos sustentan una respuesta suficiente, parcial o insuficiente. Una puntuación alta no equivale por sí sola a suficiencia técnica.

### Salida
Cada resultado debe poder identificar:
- Publicación.
- Versión publicada.
- Fragmento y encabezado.
- Conceptos asociados.
- Fuente o referencias editoriales.
- Motivo de coincidencia o tipo de recuperación.

## 11. Pruebas preliminares y resultados

Las pruebas se ejecutaron con CTE y cuatro fichas ficticias dentro de consultas SQL. No se insertaron datos.

| Prueba | Resultado observado | Interpretación |
|---|---|---|
| Singular/plural: cimentación / cimentaciones | Coincidencia positiva | El stemming español funciona para esa variante |
| Consulta “cimentación muro terreno” | Coincidencia positiva | FTS encuentra los términos principales |
| Consulta “cimentacion” contra texto “cimentación” | Sin coincidencia | Se necesita normalización de acentos |
| Alias “cimiento” contra “cimentación” | Sin coincidencia | Se necesita vocabulario editorial de alias |
| Consulta “zapata aislada” | Encontró la ficha de ejemplo | Coincidencia literal útil |
| Pregunta natural con palabras adicionales | La primera prueba no encontró resultado | Hay que preparar y evaluar consultas naturales |
| Ranking título/cuerpo | Se obtuvo orden y puntuación | Mecanismo disponible, pesos no calibrados |
| Trigramas | No probado en ejecución | Extensión no instalada |
| Búsqueda vectorial | No probada | No hay extensión instalada ni corpus/embeddings |

Los resultados de esta tabla no son una evaluación de precisión del contenido real de SERCO. Son pruebas funcionales preliminares de capacidades de PostgreSQL.

## 12. Matriz de pruebas que deberá ejecutarse con contenido real

Antes de considerar productiva la búsqueda, se debe construir un conjunto de evaluación revisado por SERCO que contenga:
- Pregunta original.
- Artículo y versión que deberían aparecer.
- Fragmento que respalda la respuesta.
- Variantes ortográficas.
- Sinónimos aprobados.
- Preguntas ambiguas.
- Preguntas fuera de cobertura.
- Casos donde un documento relacionado no debe aparecer como respuesta principal.

Categorías mínimas:
1. Coincidencia exacta.
2. Variantes singular/plural.
3. Acentos y ausencia de acentos.
4. Errores tipográficos.
5. Alias y sinónimos.
6. Preguntas redactadas en lenguaje cotidiano.
7. Términos técnicos.
8. Consultas con más de un concepto.
9. Contenido contradictorio o con versiones distintas.
10. Consultas sin contenido publicado.

Métricas:
- Precision@5: proporción de resultados relevantes dentro de los cinco primeros.
- Recall@5: proporción de resultados esperados recuperados dentro de los cinco primeros.
- MRR: posición del primer resultado relevante.
- Tasa de cero resultados incorrectos.
- Latencia p50 y p95.
- Porcentaje de consultas con cobertura suficiente, parcial e insuficiente.

Los valores objetivo deben acordarse antes de las pruebas de aceptación; no se inventan en este informe.

## 13. Cambios recomendados, todavía no ejecutados

1. Incorporar `unaccent` y configurar una cadena española que quite diacríticos antes del stemming.
2. Incorporar `pg_trgm` para tolerancia a errores y sugerencias.
3. Implementar el modelo de etapa 3: artículos, versiones, conceptos, alias y fragmentos.
4. Guardar el vector FTS por fragmento y crear índice GIN.
5. Definir una función privada de búsqueda que solo recupere versiones publicadas.
6. Ponderar título, encabezado, concepto, resumen y cuerpo.
7. Crear un conjunto de evaluación con consultas revisadas por SERCO.
8. Medir calidad y rendimiento antes de fijar pesos o umbrales.
9. Evaluar pgvector solo si quedan fallas demostrables de recuperación conceptual.
10. Mantener cada resultado ligado a una versión y referencia editorial.

## 14. Seguridad y límites operativos

- El buscador público solo debe recuperar publicaciones aprobadas y publicadas.
- No debe exponer borradores, notas internas, investigaciones sin aprobar ni metadatos privados.
- La lógica privilegiada debe ejecutarse en backend controlado.
- Las políticas RLS deben corresponder al modelo de roles y publicación de la etapa 3.
- Las consultas deben limitar longitud, frecuencia y cantidad de resultados.
- El texto recuperado es evidencia para el motor de respuesta, no una instrucción ejecutable.
- No se debe permitir que el contenido de una publicación altere permisos o reglas del sistema.
- Las citas deben conservar publicación, versión y fragmento de origen.

## 15. Dependencias y bloqueo de validación

La búsqueda productiva depende de que el modelo de etapa 3 exista físicamente en Supabase y de que haya contenido editorial publicado. Aunque el diseño de etapa 3 fue aprobado, esa aprobación no se ha convertido en autorización para ejecutar migraciones.

Por ello:
- La arquitectura de búsqueda y las pruebas preliminares quedan documentadas.
- La validación con artículos reales queda pendiente.
- Las extensiones `unaccent` y `pg_trgm` no se instalaron.
- `pgvector` no se instaló.
- No se creó una función RPC de búsqueda.
- No se creó índice ni tabla nueva.
- No se modificó el buscador prototipo ni el panel.

## 16. Dictamen de la etapa 4

**Resultado: etapa 4 completada en diagnóstico, investigación técnica, diseño de recuperación y pruebas preliminares; no certificada como búsqueda productiva.**

La base recomendada es PostgreSQL Full Text Search en español, con normalización de acentos mediante `unaccent`, vocabulario de conceptos y alias de SERCO, ranking ponderado y `pg_trgm` como mecanismo auxiliar.

No se recomienda activar pgvector todavía. Primero debe existir contenido real, medirse el rendimiento de la búsqueda léxica y comprobarse qué consultas siguen fallando.

La siguiente acción técnica necesaria es preparar e implementar, bajo autorización, las migraciones del modelo aprobado en etapa 3 y la infraestructura de búsqueda. Después se podrá ejecutar la matriz de pruebas con datos editoriales reales y decidir si la etapa 4 alcanza los criterios de aceptación.

---

## 17. Fuentes técnicas consultadas

- Supabase — Full Text Search: https://supabase.com/docs/guides/database/full-text-search
- Supabase — Hybrid Search: https://supabase.com/docs/guides/ai/hybrid-search
- PostgreSQL — unaccent: https://www.postgresql.org/docs/current/unaccent.html
- PostgreSQL — pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
- PostgreSQL — Text Search Dictionaries: https://www.postgresql.org/docs/current/textsearch-dictionaries.html
- Supabase — pgvector: https://supabase.com/docs/guides/database/extensions/pgvector

**Fin del informe técnico de la etapa 4.**
