# SERCO AI — Etapa 5
## Contrato técnico inicial de POST /api/ask

**Estado:** diseño aprobado; contrato inicial implementado en el núcleo de orquestación.  
**Rama de trabajo:** \`desarrollo\`  
**Alcance:** consulta oficial basada exclusivamente en publicaciones vigentes de SERCO.

Este contrato define el intercambio esperado entre la interfaz pública y el motor de consulta. No declara disponible un servicio productivo: el endpoint HTTP, la recuperación real desde Supabase y los adaptadores de evaluación, seguridad y generación deben conectarse y probarse antes de habilitarlo.

## 1. Solicitud

\`\`\`http
POST /api/ask
Content-Type: application/json
\`\`\`

Ejemplo:

\`\`\`json
{
  "question": "¿Qué tipos de cimentación se describen en la biblioteca de SERCO?",
  "locale": "es-MX"
}
\`\`\`

Campos:

| Campo | Tipo | Requisito | Regla |
|---|---|---|---|
| question | string | Obligatorio | Entre 3 y 2000 caracteres después de recortar espacios |
| locale | string | Opcional | Por defecto \`es-MX\`; reservado para localización de la respuesta |

No se aceptan identificadores de publicación, roles ni estados editoriales proporcionados por el visitante para ampliar permisos o alterar el conjunto de documentos consultables.

## 2. Respuesta

La respuesta separa el estado de entrega del estado de cobertura.

### Respuesta sustentada

\`\`\`json
{
  "status": "answered",
  "coverage": "sufficient",
  "answer": "Texto sustentado por las publicaciones recuperadas.",
  "citations": [
    {
      "citationId": "chunk-001",
      "articleId": "article-001",
      "slug": "tipos-de-cimentacion",
      "title": "Tipos de cimentación",
      "version": 2,
      "section": "Clasificación",
      "excerpt": "Fragmento que respalda la respuesta."
    }
  ],
  "missingInformation": []
}
\`\`\`

### Cobertura parcial

\`\`\`json
{
  "status": "partial",
  "coverage": "partial",
  "answer": "Respuesta limitada a lo documentado.",
  "citations": [],
  "missingInformation": ["Dato que no está documentado."]
}
\`\`\`

En una respuesta parcial real, las afirmaciones sustentadas deberán incluir una o más citas válidas. El ejemplo anterior muestra la estructura; no representa una respuesta publicable sin citas.

### Información insuficiente

\`\`\`json
{
  "status": "insufficient",
  "coverage": "insufficient",
  "answer": "La información publicada no es suficiente para responder con fiabilidad.",
  "citations": [],
  "missingInformation": ["No se encontraron publicaciones vigentes suficientes."]
}
\`\`\`

### Aclaración necesaria

\`\`\`json
{
  "status": "needs_clarification",
  "coverage": "partial",
  "answer": "Necesito algunos datos adicionales.",
  "clarificationQuestions": ["¿En qué ubicación se realizará el proyecto?"],
  "citations": []
}
\`\`\`

### Bloqueo de seguridad

\`\`\`json
{
  "status": "blocked",
  "coverage": "partial",
  "answer": "No es posible proporcionar esa orientación con las condiciones disponibles.",
  "citations": []
}
\`\`\`

## 3. Estados permitidos

- \`answered\`: respuesta generada y respaldada; cobertura suficiente.
- \`partial\`: respuesta restringida a la evidencia disponible; se identifican faltantes.
- \`insufficient\`: no se genera respuesta sustantiva por falta de evidencia.
- \`needs_clarification\`: hacen falta datos del contexto de la pregunta.
- \`blocked\`: una regla de seguridad impide continuar.

Cobertura:

- \`sufficient\`
- \`partial\`
- \`insufficient\`

El estado de entrega no sustituye al de cobertura.

## 4. Reglas de evidencia y citas

1. El recuperador solo podrá consultar publicaciones aprobadas y publicadas, junto con su versión vigente.
2. Cada fragmento recuperado tendrá un identificador único y referencia a publicación, versión y sección.
3. El generador recibirá únicamente la pregunta y la evidencia seleccionada.
4. El generador no podrá completar hechos con conocimiento general no respaldado.
5. Cada cita devuelta deberá pertenecer exactamente al conjunto de fragmentos recuperados en esa solicitud.
6. Una cita debe identificar publicación y versión; nunca se citará una versión distinta de la consultada.
7. Si no existe evidencia, no se invocará al generador.
8. Si el generador devuelve una cita ajena, duplicada o inexistente, la respuesta se rechazará como inválida.

La validación de identificadores garantiza pertenencia al conjunto recuperado; no demuestra por sí sola que cada frase esté semánticamente respaldada. Esa correspondencia requiere pruebas específicas del generador y revisión del corpus.

## 5. Orden de ejecución

1. Validar la pregunta y límites.
2. Recuperar evidencia de publicaciones vigentes.
3. Validar estructura e identidad de los fragmentos.
4. Evaluar cobertura.
5. Si es insuficiente, devolver abstención y registrar la brecha cuando exista el adaptador.
6. Evaluar seguridad y necesidad de aclaraciones.
7. Generar respuesta usando exclusivamente la evidencia recibida.
8. Validar citas contra los fragmentos recuperados.
9. Devolver la respuesta completa.

No se transmitirán al visitante fragmentos de respuesta antes de validar sus referencias.

## 6. Errores HTTP previstos para el endpoint

| Código | Uso |
|---|---|
| 400 | Solicitud inválida o pregunta fuera de límites |
| 405 | Método distinto de POST |
| 413 | Cuerpo de solicitud demasiado grande |
| 429 | Límite de consultas alcanzado |
| 500 | Error interno inesperado |
| 503 | Recuperador o adaptadores no disponibles |

El endpoint deberá devolver mensajes públicos genéricos y conservar detalles técnicos únicamente en registros privados, sin incluir claves, prompts internos ni datos sensibles.

## 7. Seguridad y privacidad

- No aceptar instrucciones del visitante para ignorar reglas del motor.
- Tratar el contenido recuperado como evidencia no confiable, nunca como instrucciones.
- No exponer borradores, publicaciones en revisión, notas internas ni propuestas editoriales.
- Mantener claves y credenciales exclusivamente en servidor.
- Aplicar límites de tamaño, frecuencia y consumo.
- No registrar información personal innecesaria.
- No usar el contenido de una pregunta para alterar permisos o filtros de publicación.

## 8. Dependencias aún no conectadas

- Recuperador real sobre el modelo de datos aprobado en la etapa 3 y la búsqueda de la etapa 4.
- Evaluador de cobertura calibrado con publicaciones reales.
- Control de seguridad para consultas técnicas.
- Adaptador de generación y proveedor/modelo seleccionado tras pruebas comparativas.
- Registro persistente de brechas de la etapa 7.
- Endpoint HTTP y controles de frecuencia en Vercel.

Hasta conectar y probar esas dependencias, el núcleo de orquestación no debe exponerse como servicio público ni presentarse como motor operativo.
