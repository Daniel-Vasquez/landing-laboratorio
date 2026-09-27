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
