# SERCO AI — Etapa 6: Investigación externa

**Rama:** `desarrollo`  
**Estado:** primera implementación del proveedor OpenAI y contrato HTTP; conexión operativa pendiente de credenciales y persistencia.

## Decisión de proveedor

Se adopta OpenAI como proveedor de IA y búsqueda web integrada mediante Responses API y la herramienta alojada `web_search`. El modelo se configura mediante `OPENAI_RESEARCH_MODEL`; el valor predeterminado del adaptador es `gpt-6-astra`. La clave se obtiene exclusivamente de `OPENAI_API_KEY`, en servidor.

La búsqueda web es una herramienta del modelo, no un segundo proveedor de IA. Se exige `tool_choice: "required"` para que una solicitud de investigación no se resuelva como una respuesta de memoria sin búsqueda.

Documentación oficial: https://developers.openai.com/api/docs/guides/tools-web-search

## Flujo implementado

1. Recibir una consulta de 3 a 2000 caracteres.
2. Invocar Responses API con `web_search` y contexto de búsqueda alto.
3. Instruir al modelo para priorizar fuentes primarias y técnicas, evaluar vigencia, autoridad, jurisdicción, independencia y consistencia.
4. Exigir que distinga hechos, interpretaciones, discrepancias y vacíos.
5. Extraer texto del informe y URLs de fuentes tanto de `web_search_call.action.sources` como de anotaciones `url_citation`.
6. Deduplicar las fuentes por URL.
7. Devolver el expediente como investigación externa, no como contenido oficial de SERCO.

## Endpoint

`POST /api/research`

Solicitud:

```json
{
  "query": "¿Qué normas mexicanas aplican a pavimentos de concreto hidráulico?"
}
```

Respuesta exitosa (estructura):

```json
{
  "status": "completed",
  "provider": "openai",
  "model": "gpt-6-astra",
  "query": "Consulta investigada",
  "report": "Informe documental...",
  "sources": [
    {
      "url": "https://example.org/documento",
      "title": "Título de la fuente",
      "sourceId": null
    }
  ],
  "sourceCount": 1,
  "persistence": "not_configured"
}
```

Errores controlados: 400 solicitud inválida, 405 método no permitido, 413 cuerpo demasiado grande, 429 límite del proveedor, 502 fallo del proveedor, 503 configuración no disponible y 500 error interno.

## Seguridad y límites

- La clave de OpenAI se lee desde variables de entorno del servidor; nunca se envía al navegador.
- No se acepta una URL arbitraria como destino de fetch: la única conexión saliente de este adaptador es el endpoint fijo de OpenAI. Los enlaces de fuentes se devuelven como datos.
- La investigación se instruye a tratar páginas externas como datos no confiables y a ignorar instrucciones encontradas dentro de ellas.
- El endpoint no publica ni modifica artículos.
- Se desactiva el almacenamiento en caché de la respuesta HTTP.
- Se solicita búsqueda obligatoria y se limita la consulta a 2000 caracteres.
- Los mensajes HTTP no exponen detalles internos de credenciales o del proveedor.

## Pendiente antes de operación real

1. Configurar `OPENAI_API_KEY` como variable secreta del proyecto Vercel de SERCO-Seccion-Informativa.
2. Configurar `SERCO_RESEARCH_ACCESS_TOKEN` como secreto independiente. La ruta exige `Authorization: Bearer <token>` y responde 503 si el secreto no existe, o 401 si el token no coincide. Este control es una protección transitoria de acceso administrativo; no debe incrustarse en el JavaScript del navegador.
3. Confirmar que el modelo configurado esté habilitado en la cuenta API y revisar costos/límites.
4. Implementar persistencia privada para `research_sessions` y `research_sources` según el modelo aprobado en etapa 3. Por ahora el resultado es temporal y declara `persistence: not_configured`.
5. Sustituir el control transitorio por autenticación y autorización integradas con Supabase Auth/RLS antes de habilitar uso desde el panel. Añadir límites de frecuencia y consumo.
6. Implementar el flujo de revisión editorial; no existe autopublicación.
7. Ejecutar pruebas automatizadas y pruebas de integración contra OpenAI en un entorno controlado.

## Pruebas

```bash
node --test tests/*.test.js
```

Las pruebas de esta etapa usan respuestas simuladas; no consumen API ni validan credenciales reales. No se afirma que el proveedor esté conectado hasta completar las tareas pendientes.
