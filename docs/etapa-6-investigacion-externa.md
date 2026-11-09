# SERCO AI — Etapa 6: Investigación externa

**Rama:** `desarrollo`  
**Estado:** adaptador Gemini + Google Search implementado y pruebas unitarias preparadas; conexión real, interfaz y persistencia pendientes.

## Decisión de proveedor

La investigación externa utiliza **Google Gemini Developer API** con la herramienta integrada **Google Search grounding**. Se reutiliza la variable secreta `GEMINI_API_KEY`; no requiere una credencial de otro proveedor.

- Variable de credencial: `GEMINI_API_KEY`.
- Variable opcional del modelo: `GEMINI_RESEARCH_MODEL`.
- Modelo predeterminado: `gemini-3.8-flash`.
- Endpoint: `generateContent`.
- Herramienta: `google_search`.

Documentación oficial:
- https://ai.google.dev/gemini-api/docs/generate-content/google-search
- https://ai.google.dev/api/generate-content

## Flujo implementado

1. Recibir una consulta de 3 a 2000 caracteres.
2. Invocar Gemini `generateContent` con `google_search`.
3. Instruir al modelo para investigar en la web, priorizar fuentes primarias y técnicas, evaluar vigencia, autoridad, jurisdicción, independencia y consistencia.
4. Exigir que distinga hechos, interpretaciones, discrepancias y vacíos.
5. Extraer el informe desde el contenido del candidato.
6. Extraer fuentes verificables desde `groundingMetadata.groundingChunks`; validar URLs HTTP(S) y deduplicar.
7. Extraer las relaciones entre segmentos y fuentes desde `groundingSupports`.
8. Devolver las consultas de búsqueda y el HTML oficial de sugerencias Google Search (`searchEntryPoint.renderedContent`) cuando Gemini lo proporcione.
9. Si Gemini no devuelve fuentes web fundamentadas, rechazar el resultado como investigación verificada.
10. Devolver el expediente como investigación externa, nunca como contenido oficial aprobado de SERCO.

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
  "provider": "gemini",
  "model": "gemini-3.8-flash",
  "query": "Consulta investigada",
  "report": "Informe documental...",
  "sources": [
    {
      "url": "https://example.org/documento",
      "title": "Título de la fuente"
    }
  ],
  "sourceCount": 1,
  "searchQueries": ["consulta enviada a Google Search"],
  "searchSuggestionsHtml": "<contenido oficial de Google, cuando se proporcione>",
  "groundingSupports": [],
  "persistence": "not_configured"
}
```

Errores controlados: 400 solicitud inválida, 405 método no permitido, 413 cuerpo demasiado grande, 429 límite del proveedor, 502 fallo del proveedor, 503 configuración no disponible y 500 error interno.

## Requisitos de presentación de Google Search

Cuando Gemini devuelve `groundingMetadata.searchEntryPoint.renderedContent`, Google exige mostrar las sugerencias de búsqueda proporcionadas, sin modificar su presentación, y mantenerlas visibles junto con el resultado fundamentado. También exige mostrar las fuentes. La futura interfaz deberá presentar ese contenido oficial de Google en un contenedor seguro compatible, y mostrar las fuentes y sus relaciones con las afirmaciones.

No se debe sustituir el HTML de sugerencias por chips inventados ni alterar sus estilos. La interfaz pública todavía no está conectada a este endpoint; por tanto, no se afirma que la presentación requerida ya esté resuelta.

Documentación de requisitos de presentación:
https://firebase.google.com/docs/ai-logic/grounding-google-search

## Seguridad y límites

- La clave Gemini se lee exclusivamente desde el servidor y nunca se envía al navegador.
- No se acepta una URL arbitraria como destino de fetch: el adaptador solo conecta con el endpoint fijo de Gemini.
- La investigación trata páginas externas como datos no confiables e ignora instrucciones encontradas dentro de ellas.
- El endpoint no publica ni modifica artículos.
- Se desactiva el almacenamiento en caché de la respuesta HTTP.
- Se limita la consulta a 2000 caracteres.
- Los mensajes HTTP no exponen detalles internos de credenciales o del proveedor.
- La ruta conserva el control transitorio `SERCO_RESEARCH_ACCESS_TOKEN`; responde 503 si falta y 401 si el token no coincide. No debe incrustarse en JavaScript público.

## Pendiente antes de operación real

1. Confirmar que `GEMINI_API_KEY` esté disponible en Preview y Production del proyecto Vercel independiente.
2. Confirmar que la cuenta/API y el modelo admitan Google Search grounding y revisar límites y costos. La búsqueda fundamentada puede generar cargos según las consultas que Google Search ejecute.
3. Configurar `SERCO_RESEARCH_ACCESS_TOKEN` solo para el uso administrativo temporal. Antes de exponer investigación a visitantes, sustituirlo por autenticación y autorización integradas con Supabase Auth/RLS.
4. Conectar la interfaz pública al flujo de sugerencia de investigación cuando la cobertura SERCO sea insuficiente, manteniendo claramente separadas las respuestas oficiales y las investigaciones externas.
5. Presentar obligatoriamente `searchSuggestionsHtml` cuando venga en la respuesta y mostrar las fuentes; enlazar las citas con sus segmentos mediante `groundingSupports`.
6. Implementar persistencia privada para `research_sessions` y `research_sources` según el modelo aprobado en etapa 3. Por ahora el resultado es temporal y declara `persistence: not_configured`.
7. Añadir límites de frecuencia y consumo.
8. Implementar revisión editorial humana; no existe autopublicación.
9. Ejecutar pruebas automatizadas y una prueba real controlada con Gemini en Vercel.

## Pruebas

```bash
node --test tests/*.test.js
```

Las pruebas de esta etapa usan respuestas simuladas; no consumen API ni validan credenciales reales. No se afirma que el proveedor esté conectado hasta completar las tareas pendientes.
