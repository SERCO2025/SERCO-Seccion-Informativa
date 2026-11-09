"use strict";

const PROJECT_SPECIFIC_ACTION = /\b(debo|deberia|debería|conviene|recomiend[ae]|diseñ[ae]|dimension[ae]|calcul[ae]|construir|colocar|reforzar|excavar|cimentar|soportar|resistir|autorizar|validar|es seguro|puedo usar)\b/i;
const HIGH_IMPACT_DOMAIN = /\b(cimentaci[oó]n|zapata|losa|columna|castillo|viga|trabe|muro de contenci[oó]n|estructura|carga|sismo|talud|excavaci[oó]n|acero|concreto|armado|refuerzo|anclaje|estabilidad|seguridad estructural)\b/i;

function createConstructionSafetyGuard() {
  return {
    async evaluate(input) {
      if (!input || typeof input.question !== "string") {
        throw new TypeError("El control de seguridad requiere una pregunta.");
      }

      const question = input.question.trim();
      const isProjectSpecific = PROJECT_SPECIFIC_ACTION.test(question) &&
        HIGH_IMPACT_DOMAIN.test(question);

      if (!isProjectSpecific) {
        return { decision: "allow" };
      }

      return {
        decision: "clarify",
        message: "La consulta puede afectar la seguridad o el desempeño de una construcción. Antes de orientar sobre una decisión de proyecto, necesito conocer las condiciones específicas. La información general publicada no sustituye el cálculo ni la revisión de un profesional responsable.",
        questions: [
          "¿En qué ubicación se encuentra el proyecto y qué normativa o reglamento aplica?",
          "¿Qué dimensiones, configuración y uso tendrá el elemento?",
          "¿Qué información existe sobre el terreno, cargas y condiciones de apoyo?",
          "¿Qué materiales y especificaciones se utilizarán?"
        ]
      };
    }
  };
}

module.exports = { createConstructionSafetyGuard };
