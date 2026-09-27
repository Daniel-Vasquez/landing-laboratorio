import { z } from 'zod';
import { QUESTION_IDS } from './questions.ts';

/**
 * Teléfono en formato E.164 (`+525512345678`).
 *
 * El formato canónico NO es un capricho: la API de WhatsApp exige el número
 * SIN el `+`, sin espacios ni guiones, mientras que `tel:` sí acepta el `+`.
 * Guardar una sola forma canónica y derivar las dos evita que un número escrito
 * como «55 1234 5678» genere un enlace que no abre ningún chat — un fallo
 * silencioso que solo se detecta perdiendo leads.
 */
export const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, {
  message: 'Usa formato internacional sin espacios, por ejemplo +525512345678.',
});

export const questionOptionSchema = z.object({
  value: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(160),
  featured: z.boolean().optional(),
});

export const questionConfigSchema = z.object({
  label: z.string().trim().min(5).max(160),
  options: z.array(questionOptionSchema).min(2).max(8),
});

export const contactConfigSchema = z.object({
  whatsapp: e164,
  telefono: e164,
  correo: z.email({ message: 'Introduce un correo válido.' }),
});

export const leadFormTextsSchema = z.object({
  titulo: z.string().trim().min(5).max(80),
  intro: z.string().trim().max(200),
  exito: z.string().trim().min(5).max(200),
  consentimiento: z.string().trim().min(20).max(400),
});

export const leadFormConfigSchema = z.object({
  contacto: contactConfigSchema,
  preguntas: z.record(
    z.enum(QUESTION_IDS as [string, ...string[]]),
    questionConfigSchema,
  ),
  textos: leadFormTextsSchema,
});

export type QuestionConfig = z.infer<typeof questionConfigSchema>;
export type ContactConfig = z.infer<typeof contactConfigSchema>;
export type LeadFormTexts = z.infer<typeof leadFormTextsSchema>;
export type LeadFormConfig = z.infer<typeof leadFormConfigSchema>;

/** Teléfono mexicano de 10 dígitos tal como lo escribe el visitante. */
const telefonoMx = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 10, { message: 'Escribe tu teléfono a 10 dígitos.' });

/**
 * Payload del formulario público.
 *
 * `superRefine` valida el campo de contacto SEGÚN el medio: pedir siempre los
 * dos obligaría al visitante a dar un dato que no va a usarse.
 */
export const leadPayloadSchema = z
  .object({
    medio: z.enum(['whatsapp', 'llamada', 'correo']),
    nombre: z.string().trim().min(2, { message: 'Escribe tu nombre.' }).max(80),
    telefono: z.string().optional(),
    correo: z.string().optional(),
    motivo: z.string().min(1).max(40),
    estudio: z.string().min(1).max(40),
    plazo: z.string().min(1).max(40),
    /** Sección desde la que se abrió el formulario. */
    origen: z.string().max(40).optional(),
    consentimiento: z.literal(true, {
      message: 'Necesitamos tu consentimiento para tratar tus datos.',
    }),
    /**
     * Trampa para bots. Se acepta CUALQUIER valor en el esquema a propósito:
     * si Zod lo rechazara, el bot recibiría un 400 señalando este campo y
     * aprendería a dejarlo vacío. La comprobación vive en el endpoint, que
     * responde 200 fingiendo éxito.
     */
    empresa: z.string().max(200).optional(),
    /** Milisegundos que el formulario estuvo abierto. */
    ms: z.number().int().min(0).max(86_400_000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.medio === 'correo') {
      const parsed = z.email().safeParse(data.correo ?? '');
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', path: ['correo'], message: 'Introduce un correo válido.' });
      }
      return;
    }
    const parsed = telefonoMx.safeParse(data.telefono ?? '');
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', path: ['telefono'], message: 'Escribe tu teléfono a 10 dígitos.' });
    }
  });

export type LeadPayload = z.infer<typeof leadPayloadSchema>;
