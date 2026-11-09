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

No se modificó \`api/ask.js\`; el endpoint público permanece deshabilitado y sin proveedor conectado.

## Ejecutar pruebas simuladas

Requiere Node.js con \`node:test\`, sin dependencias adicionales:

\`\`\`bash
node --test tests/ai-provider-contract.test.js
\`\`\`

Estas pruebas verifican contratos, endpoints, cabeceras, formatos JSON, credenciales ausentes, cuotas agotadas y salidas inválidas. No consumen API ni prueban la disponibilidad real de las cuentas.

## Pruebas reales pendientes

1. Crear una clave gratuita de Gemini AI Studio.
2. Crear una clave Groq y comprobar la pestaña Free Plan Limits de la cuenta.
3. Crear un API Token de Cloudflare con permiso Workers AI y confirmar que la cuenta usa Workers Free, sin método de pago.
4. Configurar las claves solo en el entorno local de pruebas o en secretos de servidor autorizados; nunca pegarlas en GitHub ni en el chat.
5. Ejecutar el mismo conjunto de preguntas públicas/ficticias contra cada proveedor, de uno en uno.
6. Registrar modelo, fecha, duración, resultado, uso reportado y errores de cuota.
7. Evaluar calidad de respuesta y citas antes de elegir el proveedor principal.

## Fuentes oficiales

- Gemini precios: https://ai.google.dev/gemini-api/docs/pricing
- Gemini límites: https://ai.google.dev/gemini-api/docs/rate-limits
- Groq modelos: https://console.groq.com/docs/models
- Groq límites: https://console.groq.com/docs/rate-limits
- Groq salida estructurada: https://console.groq.com/docs/structured-outputs
- Cloudflare precios: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare API compatible: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- Cloudflare modelos: https://developers.cloudflare.com/workers-ai/models/
