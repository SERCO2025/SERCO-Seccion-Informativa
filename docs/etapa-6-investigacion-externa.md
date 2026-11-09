# SERCO AI — Etapa 6: Investigación externa

**Rama:** `desarrollo`  
**Estado:** adaptador Tavily + análisis Gemini implementados; conexión real, interfaz y persistencia pendientes.

## Proveedores y responsabilidades

La investigación externa separa búsqueda y análisis:

- **Tavily Search API:** recupera resultados web y fragmentos.
- **Gemini Developer API:** analiza exclusivamente los resultados recuperados y redacta el informe.
- La búsqueda Tavily usa `search_depth: basic`, `max_results: 8`, `include_answer: false` e `include_raw_content: false`.
- Una búsqueda básica consume 1 crédito. La cuota gratuita publicada por Tavily es de 1,000 créditos mensuales sin tarjeta.
- No se habilita búsqueda avanzada ni pago por uso desde el código.

Variables de entorno del proyecto Vercel independiente:

- `TAVILY_API_KEY` — nueva variable requerida para búsqueda.
- `GEMINI_API_KEY` — variable existente para análisis.
- `GEMINI_RESEARCH_MODEL` — opcional; modelo predeterminado `gemini-3.8-flash`.

Documentación:
- https://docs.tavily.com/documentation/api-reference/endpoint/search
- https://docs.tavily.com/documentation/api-credits
- https://ai.google.dev/api/generate-content

## Flujo

1. Validar consulta (3–2000 caracteres).
2. Ejecutar una búsqueda Tavily básica.
3. Normalizar hasta ocho resultados, validar URLs HTTP(S) y eliminar duplicados.
4. Pasar títulos, URLs, fechas y fragmentos a Gemini.
5. Pedir a Gemini análisis en español, contraste, limitaciones y referencias numeradas [1], [2], etc.
6. Devolver el informe y las fuentes asociadas.
7. Si Tavily no devuelve fuentes utilizables, no solicitar redacción a Gemini.
8. La investigación sigue siendo externa y no se publica automáticamente como contenido oficial SERCO.

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
  "provider": "tavily+gemini",
  "searchProvider": "tavily",
  "answerProvider": "gemini",
  "query": "Consulta investigada",
  "report": "Informe documental...",
  "sources": [
    {
      "id": 1,
      "url": "https://example.org/documento",
      "title": "Título de la fuente",
      "publishedDate": null
    }
  ],
  "sourceCount": 1,
  "searchUsage": { "credits": 1 },
  "searchSuggestionsHtml": null,
  "groundingSupports": [],
  "persistence": "not_configured"
}
```

Las referencias [n] que redacta Gemini se basan en la lista de fuentes recuperadas por Tavily. No se afirma una alineación de citas por segmento equivalente a Google Grounding; la UI debe mostrar las referencias y sus URLs junto al informe.

## Seguridad y control de consumo

- Las claves se leen exclusivamente en el backend y nunca se envían al navegador.
- Tavily usa endpoint fijo y autenticación Bearer.
- Se usa búsqueda `basic` (1 crédito), ocho resultados máximos y no se solicitan respuestas IA ni contenido completo.
- Errores 429, 432 y 433 se tratan como límites de cuota/solicitudes; no hay fallback a un proveedor de pago.
- No hay activación automática de planes ni pagos desde la aplicación.
- La ruta conserva el control administrativo temporal `SERCO_RESEARCH_ACCESS_TOKEN`; no debe incrustarse en JavaScript público.
- No se autopublica contenido externo.

## Pendientes antes de operación real

1. Crear una clave en https://app.tavily.com y agregarla como `TAVILY_API_KEY` en el proyecto Vercel independiente, tanto en Preview como Production cuando corresponda.
2. Confirmar que el panel de Tavily permanezca en el plan gratuito y que el pago por uso no esté activado.
3. Conectar la interfaz pública mediante autenticación, autorización y límites; nunca exponer claves ni el token administrativo.
4. Mostrar las fuentes numeradas junto al informe y validar que cada referencia [n] tenga una fuente correspondiente.
5. Implementar persistencia privada para `research_sessions` y `research_sources`; por ahora `persistence: not_configured`.
6. Implementar límites de frecuencia y consumo del lado servidor.
7. Ejecutar pruebas reales controladas con claves configuradas en Vercel.

## Pruebas

```bash
node --test tests/*.test.js
```

Las pruebas automatizadas usan respuestas simuladas; no consumen créditos Tavily ni llamadas reales de Gemini.
