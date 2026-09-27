import { getDb, isMongoConfigured } from '../mongo.ts';
import { recordChange } from '../audit.ts';
import { QUESTIONS, getQuestion, isQuestionId, type QuestionId } from './questions.ts';
import { leadFormConfigSchema, type LeadFormConfig, type QuestionConfig } from './schemas.ts';

const CONFIG_ID = 'lead_form';

export type Editor = { userId: string; name: string; email: string };

/**
 * Contactos VACÍOS por defecto, a propósito.
 *
 * Un número de ejemplo en producción envía leads a un desconocido. Se prefiere
 * que `preflight` avise y que el formulario se niegue a enviar, a que funcione
 * hacia el destino equivocado.
 */
export const EMPTY_CONTACT = { whatsapp: '', telefono: '', correo: '' };

export const DEFAULT_TEXTS = {
  titulo: 'Agenda tus estudios',
  intro: 'Responde tres preguntas rápidas y te contactamos por donde prefieras.',
  exito: '¡Listo! Te contactaremos muy pronto.',
  consentimiento:
    'He leído y acepto el aviso de privacidad y autorizo el tratamiento de mis datos personales, incluidos los sensibles, para agendar mis estudios.',
};

export type ResolvedLeadForm = {
  contacto: { whatsapp: string; telefono: string; correo: string };
  preguntas: Record<QuestionId, QuestionConfig>;
  textos: typeof DEFAULT_TEXTS;
  /** `false` mientras falte algún dato de contacto: el formulario no puede enviar. */
  ready: boolean;
};

function defaultQuestions(): Record<QuestionId, QuestionConfig> {
  const entries = QUESTIONS.map((question) => [
    question.id,
    { label: question.defaultLabel, options: question.defaultOptions.map((o) => ({ ...o })) },
  ]);
  return Object.fromEntries(entries) as Record<QuestionId, QuestionConfig>;
}

async function getConfigCollection() {
  return (await getDb()).collection<{ _id: string } & Partial<LeadFormConfig>>('landing_config');
}

/**
 * Configuración del formulario, reconciliada SIEMPRE contra el registro.
 *
 * - Una pregunta guardada que ya no está en el registro se descarta.
 * - Una del registro ausente del documento se añade con sus valores por defecto,
 *   así que desplegar una pregunta nueva no exige tocar la base.
 * - Las opciones de `contacto` se reponen SIEMPRE desde el registro: cada una
 *   activa una rama de envío, y una opción sin rama sería un envío muerto.
 */
export async function getLeadFormConfig(): Promise<ResolvedLeadForm> {
  const fallback: ResolvedLeadForm = {
    contacto: { ...EMPTY_CONTACT },
    preguntas: defaultQuestions(),
    textos: { ...DEFAULT_TEXTS },
    ready: false,
  };

  if (!isMongoConfigured()) return fallback;

  try {
    const doc = await (await getConfigCollection()).findOne({ _id: CONFIG_ID });
    if (!doc) return fallback;

    const preguntas = defaultQuestions();
    for (const [id, stored] of Object.entries(doc.preguntas ?? {})) {
      if (!isQuestionId(id)) continue;
      const definition = getQuestion(id)!;
      preguntas[id] = {
        label: stored.label || definition.defaultLabel,
        // Opciones fijas: se ignora lo guardado y manda el registro.
        options: definition.optionsEditable
          ? stored.options.map((option) => ({ ...option }))
          : definition.defaultOptions.map((option) => ({ ...option })),
      };
    }

    const contacto = { ...EMPTY_CONTACT, ...(doc.contacto ?? {}) };
    const textos = { ...DEFAULT_TEXTS, ...(doc.textos ?? {}) };

    return {
      contacto,
      preguntas,
      textos,
      ready: Boolean(contacto.whatsapp && contacto.telefono && contacto.correo),
    };
  } catch (error) {
    console.warn(
      `[leads] No se pudo leer la configuración, se usan valores por defecto. ` +
        `Causa: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallback;
  }
}

/**
 * Guarda la configuración. Normaliza en el SERVIDOR:
 *   1. descarta preguntas fuera del registro;
 *   2. repone las opciones de las preguntas no editables;
 *   3. completa con los valores por defecto lo que falte.
 */
export async function setLeadFormConfig(
  input: LeadFormConfig,
  editor: Editor,
): Promise<void> {
  const parsed = leadFormConfigSchema.parse(input);

  const preguntas = defaultQuestions();
  for (const [id, stored] of Object.entries(parsed.preguntas)) {
    if (!isQuestionId(id)) continue;
    const definition = getQuestion(id)!;
    preguntas[id] = {
      label: stored.label,
      options: definition.optionsEditable
        ? stored.options
        : definition.defaultOptions.map((option) => ({ ...option })),
    };
  }

  const now = new Date();
  await (await getConfigCollection()).updateOne(
    { _id: CONFIG_ID },
    {
      $set: {
        contacto: parsed.contacto,
        preguntas,
        textos: parsed.textos,
        updatedAt: now,
        updatedBy: editor,
      },
    },
    { upsert: true },
  );

  await recordChange({ ...editor, sectionKey: 'cta_final', at: now });
}
