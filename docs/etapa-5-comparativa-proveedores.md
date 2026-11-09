# SERCO AI — Comparativa de proveedores de generación

**Rama:** \`desarrollo\`  
**Estado:** adaptadores y pruebas simuladas incorporados; pruebas reales con API pendientes.  
**Alcance:** generación de respuestas RAG con evidencia pública de SERCO.

## Selección inicial

| Proveedor | Modelo de evaluación | Variable(s) de entorno |
|---|---|---|
| Google Gemini API | \`gemini-3.8-flash\` | \`GEMINI_API_KEY\`, opcional \`GEMINI_MODEL\` |
| GroqCloud | \`openai/gpt-oss-120b\` | \`GROQ_API_KEY\`, opcional \`GROQ_MODEL\` |
| Cloudflare Workers AI | \`@cf/zai-org/glm-4.7-flash\` | \`CLOUDFLARE_ACCOUNT_ID\`, \`CLOUDFLARE_API_TOKEN\`, opcional \`CLOUDFLARE_AI_MODEL\` |

Los identificadores son valores iniciales de evaluación, no una selección definitiva de producción. Deben comprobarse en la cuenta y en el catálogo oficial antes de cada prueba real.

## Condición económica

- No se configura ninguna tarjeta, cuenta de facturación ni crédito prepago desde el código.
- Los adaptadores no tienen mecanismo para activar planes pagados.
- Los errores HTTP 402, 429 y de acceso se convierten en errores controlados.
- No existe cambio automático de proveedor. Una cuota agotada detiene esa prueba.
- Los proveedores se invocan exclusivamente desde el servidor; las claves nunca se exponen al navegador.
- Cloudflare Workers AI incluye 10,000 Neurons diarios en Workers Free; al exceder la asignación, las operaciones gratuitas fallan. Algunos modelos requieren un método de pago y no deben seleccionarse.
- Gemini ofrece cuota gratuita para modelos seleccionados, incluido Gemini 3.8 Flash según la tabla de precios consultada. Los límites exactos por proyecto se muestran en AI Studio.
- Groq publica límites de plan gratuito por modelo. La cuenta debe confirmar sus límites efectivos en la página Limits.
- Antes de ejecutar una comparación real, confirma que cada cuenta esté en su modalidad gratuita y que no tenga facturación habilitada. El código no puede detectar ni impedir cobros configurados directamente en las cuentas del proveedor.

## Contrato común

Cada adaptador implementa:

\`generate({ question, evidence, coverage, instructions })\`

Devuelve:

\`{ text, citationIds, provider, model, usage }\`

La salida del modelo se limita a JSON con \`text\` y \`citationIds\`. El orquestador de SERCO sigue siendo responsable de verificar que cada identificador citado pertenezca a la evidencia recuperada. El adaptador no decide suficiencia, no recupera publicaciones y no registra brechas.

## Archivos incorporados

- \`src/services/ai/provider-utils.js\`: validación de entrada, instrucciones comunes, parseo JSON y errores de proveedor.
- \`src/services/ai/providers/gemini-answer-provider.js\`
- \`src/services/ai/providers/groq-answer-provider.js\`
- \`src/services/ai/providers/cloudflare-answer-provider.js\`
- \`tests/ai-provider-contract.test.js\`: pruebas con fetch simulado.
- \`scripts/compare-ai-providers.js\`: comparación real opcional con dos escenarios ficticios.
- \`.github/workflows/pruebas-adaptadores-ia.yml\`: ejecuta la suite completa de pruebas en cada cambio relevante de la rama \`desarrollo\`.
- \`.github/workflows/comparar-proveedores-ia.yml\`: comparación manual, nunca automática, mediante secretos de GitHub Actions.

## Pruebas automatizadas

La suite completa se ejecutó correctamente en GitHub Actions con Node.js 22:

- 34 pruebas.
- 34 aprobadas.
- 0 fallidas.
- Incluye orquestador RAG, handlers HTTP, proveedor de investigación OpenAI y los tres adaptadores nuevos.
- Son pruebas simuladas: no consumen API y no prueban todavía las credenciales ni la calidad real de los modelos.

## Ejecutar comparación real sin exponer claves

La comparación se ejecuta manualmente desde GitHub Actions. No se debe pegar ninguna clave en el chat, en archivos del repositorio ni en variables públicas de Vercel.

1. Crear las claves en las cuentas gratuitas de cada proveedor, sin habilitar facturación ni agregar tarjeta.
2. En el repositorio GitHub, abrir **Settings → Secrets and variables → Actions**.
3. Crear únicamente los secretos de los proveedores que se vayan a probar:
   - \`GEMINI_API_KEY\`
   - \`GROQ_API_KEY\`
   - \`CLOUDFLARE_ACCOUNT_ID\`
   - \`CLOUDFLARE_API_TOKEN\`
4. Abrir **Actions → Comparar proveedores gratuitos de IA → Run workflow**.
5. Elegir la rama \`desarrollo\` y ejecutar manualmente.

El script omite proveedores sin credenciales. Para Cloudflare se necesitan tanto el ID de cuenta como el token. El token debe tener únicamente el permiso de Workers AI necesario para ejecutar modelos. No agregar secretos de OpenAI a este flujo.

El script realiza dos solicitudes por cada proveedor configurado. Utiliza únicamente una ficha ficticia de prueba; no envía documentos privados ni contenido real de SERCO. El resultado se muestra en los logs de la ejecución. Ejecutarlo solo después de verificar que las cuentas están en modalidad gratuita y sin facturación habilitada.

## Fuentes oficiales

- Gemini precios: https://ai.google.dev/gemini-api/docs/pricing
- Gemini límites: https://ai.google.dev/gemini-api/docs/rate-limits
- Groq modelos: https://console.groq.com/docs/models
- Groq límites: https://console.groq.com/docs/rate-limits
- Groq salida estructurada: https://console.groq.com/docs/structured-outputs
- Cloudflare precios: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare API compatible: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- Cloudflare modelos: https://developers.cloudflare.com/workers-ai/models/
