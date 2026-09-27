/**
 * Registro CERRADO de preguntas del formulario.
 *
 * El requerimiento es explícito: el administrador SOLO reformula textos y
 * modifica opciones; no puede añadir ni eliminar preguntas. Igual que las
 * ranuras de imagen (`images/slots.ts`), el catálogo de iconos (`icons/names.ts`)
 * y el registro de secciones (`sections/registry.ts`), lo que define la
 * estructura vive en código: ocultar un botón no impide un POST directo, pero un
 * `id` fuera de este registro sí se rechaza en el servidor.
 */

export type QuestionId = 'contacto' | 'motivo' | 'estudio' | 'plazo';

export type QuestionOption = {
  /**
   * Código INMUTABLE. Nunca cambia, aunque se reformule la etiqueta.
   *
   * Mismo patrón que el `imageKey` de la Tanda 13: si el emparejamiento
   * dependiera del texto, reformular «Control de glucosa o diabetes» rompería
   * el histórico de leads ya registrados.
   */
  value: string;
  /** Texto visible. Editable desde el panel. */
  label: string;
  /** Destacada visualmente (la opción recomendada). */
  featured?: boolean;
};

export type QuestionDefinition = {
  id: QuestionId;
  /** 0 = persistente: visible en los tres pasos, no pertenece a ninguno. */
  step: 0 | 1 | 2 | 3;
  defaultLabel: string;
  defaultOptions: readonly QuestionOption[];
  /**
   * `false` = el panel no puede añadir ni quitar opciones.
   * Solo aplica a `contacto`: cada una de sus tres opciones activa una rama de
   * envío distinta, así que añadir una sin implementar su rama dejaría un envío
   * muerto.
   */
  optionsEditable: boolean;
  layout: 'stack' | 'inline';
};

export const QUESTIONS: readonly QuestionDefinition[] = [
  {
    id: 'contacto',
    step: 0,
    defaultLabel: '¿Cómo prefieres que te contactemos?',
    optionsEditable: false,
    layout: 'inline',
    defaultOptions: [
      { value: 'whatsapp', label: 'WhatsApp', featured: true },
      { value: 'llamada', label: 'Llamada telefónica' },
      { value: 'correo', label: 'Correo electrónico' },
    ],
  },
  {
    id: 'motivo',
    step: 1,
    defaultLabel: '¿Cuál es el motivo principal de tu consulta hoy?',
    optionsEditable: true,
    layout: 'stack',
    defaultOptions: [
      { value: 'chequeo', label: 'Chequeo preventivo de rutina (revisión general anual)' },
      { value: 'orden', label: 'Indicación u orden de mi médico' },
      { value: 'sintomas', label: 'Presento síntomas o malestar y quiero revisarme' },
    ],
  },
  {
    id: 'estudio',
    step: 2,
    defaultLabel: '¿Qué tipo de estudio o perfil necesitas realizarte?',
    optionsEditable: true,
    layout: 'stack',
    defaultOptions: [
      { value: 'checkup', label: 'Check-up general o preventivo (Biometría, Química, Orina)' },
      { value: 'glucosa', label: 'Control de glucosa o diabetes (Hemoglobina glucosilada)' },
      { value: 'lipidos', label: 'Salud cardiovascular y colesterol (Perfil de lípidos)' },
      { value: 'hormonal', label: 'Perfiles hormonales o tiroideos' },
      { value: 'orientacion', label: 'Otro estudio especializado / Requiero orientación' },
    ],
  },
  {
    id: 'plazo',
    step: 2,
    defaultLabel: '¿Para cuándo planeas realizarte tus estudios?',
    optionsEditable: true,
    layout: 'inline',
    defaultOptions: [
      { value: 'inmediato', label: 'Lo antes posible (Hoy o mañana)' },
      { value: 'semana', label: 'Esta misma semana' },
      { value: 'mes', label: 'En los próximos 15 a 30 días' },
      { value: 'cotizando', label: 'Solo estoy cotizando por el momento' },
    ],
  },
] as const;

export const QUESTION_IDS = QUESTIONS.map((question) => question.id);

export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === 'string' && QUESTIONS.some((question) => question.id === value);
}

export function getQuestion(id: string): QuestionDefinition | undefined {
  return QUESTIONS.find((question) => question.id === id);
}

/** Opciones de contacto: los tres medios que tienen rama de envío. */
export const CONTACT_VALUES = ['whatsapp', 'llamada', 'correo'] as const;
export type ContactMedium = (typeof CONTACT_VALUES)[number];

/** Texto del botón de envío, según el medio elegido. */
export const SUBMIT_LABELS: Record<ContactMedium, string> = {
  whatsapp: 'Enviar WhatsApp',
  correo: 'Enviar correo',
  llamada: 'Realizar llamada',
};

/** Código estable para una opción nueva creada desde el panel. */
export function newOptionValue(): string {
  return `opt-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}
