# SERCO AI — Etapa 6: Investigación externa

**Rama:** `desarrollo`  
**Estado:** integración de interfaz y endpoints públicos implementada; validación real con Tavily/Gemini y despliegue Preview pendientes.

## Proveedores y responsabilidades

- **Tavily Search API:** recupera resultados web y fragmentos.
- **Gemini Developer API:** analiza exclusivamente los resultados recuperados y redacta el informe.
- La búsqueda Tavily usa `search_depth: basic`, `max_results: 8`, `include_answer: false` e `include_raw_content: false`.
- No se habilita búsqueda avanzada ni pago por uso desde el código.
- La investigación externa nunca se publica automáticamente como contenido oficial SERCO.

Variables de entorno requeridas en el proyecto Vercel independiente:

- `TAVILY_API_KEY` — búsqueda web.
- `GEMINI_API_KEY` — análisis.
- `SUPABASE_URL` y `SUPABASE_SECRET_KEY` — recuperación de conocimiento y control de cuotas.
- `GEMINI_RESEARCH_MODEL` — opcional; modelo predeterminado `gemini-3.8-flash`.

## Flujo de la interfaz

1. El visitante envía una pregunta desde `index.html`.
2. La interfaz consulta `POST /api/ask`, que busca exclusivamente publicaciones vigentes de SERCO.
3. Si la cobertura es suficiente, presenta la respuesta oficial y sus citas.
4. Si la cobertura es parcial o insuficiente, pregunta expresamente si desea buscar información adicional en Internet.
5. Solo después de pulsar **Sí, buscar en Internet**, la interfaz llama a `POST /api/research-public`.
6. El backend ejecuta Tavily y pasa sus resultados a Gemini.
7. La interfaz distingue el informe externo de la información oficial y presenta los enlaces de las fuentes.
8. Si el visitante rechaza la búsqueda, se conserva únicamente la respuesta de la biblioteca SERCO.

Las preguntas que requieran aclaración por el control de seguridad no activan la invitación de investigación hasta que se resuelva esa aclaración.

## Endpoints

- `POST /api/ask` — consulta de la biblioteca oficial SERCO.
- `POST /api/research-public` — investigación externa pública, invocada únicamente tras consentimiento en la interfaz.
- `POST /api/research` — endpoint administrativo anterior; conserva `SERCO_RESEARCH_ACCESS_TOKEN` y no se expone en el navegador.

## Protección de consumo

Se agregó `private.public_api_rate_limits` y la función `public.consume_public_api_quota`, ejecutable únicamente por `service_role`. El navegador no puede llamar directamente a esa función ni consultar la tabla.

Límites actuales por ventana horaria:

| Servicio | Por origen | Global del proyecto |
|---|---:|---:|
| Consulta SERCO | 20 | 120 |
| Investigación externa | 3 | 30 |

El backend calcula un HMAC del origen de la solicitud; no almacena la dirección IP en claro. Si el control de cuotas no está disponible, los endpoints públicos fallan de forma cerrada y no llaman a los proveedores.

## Seguridad y límites conocidos

- Las claves de Tavily, Gemini y Supabase permanecen exclusivamente en el backend.
- Tavily usa búsqueda básica y hasta ocho resultados.
- No se envía contenido completo de las páginas a Tavily ni se activa pago por uso desde el código.
- La respuesta externa se muestra como investigación, no como postura oficial de SERCO.
- Las fuentes se enlazan por separado; la numeración [n] del informe se basa en la lista de resultados recuperados.
- La persistencia editorial de sesiones y fuentes todavía no está implementada; el proveedor devuelve `persistence: not_configured`.
- El control de cuotas reduce abuso y gasto accidental, pero no sustituye una política de retención/limpieza de contadores ni una solución anti-bot especializada.

## Pendientes de validación y lanzamiento

1. Confirmar que `TAVILY_API_KEY` está guardada en Preview y Development del proyecto Vercel correcto.
2. Identificar y verificar el proyecto Vercel independiente enlazado al repositorio; el contexto de Vercel consultado actualmente solo muestra el proyecto corporativo `serco`, por lo que no se debe desplegar en ese proyecto.
3. Confirmar que el commit de `desarrollo` tenga un deployment Preview y probar la interfaz desde ese deployment.
4. Ejecutar una consulta real controlada que llegue a cobertura insuficiente y aceptar la investigación; comprobar Tavily, Gemini y fuentes.
5. Implementar persistencia privada de `research_sessions` y `research_sources`.
6. Implementar limpieza/retención de los contadores de cuotas.
7. Revisar las referencias [n] del informe contra las fuentes antes de pasar a producción.

## Pruebas

```bash
node --test tests/*.test.js
```

Las pruebas automatizadas usan respuestas simuladas; no consumen créditos Tavily ni llamadas reales de Gemini.
