import { z } from 'zod';

/**
 * Los esquemas Zod son la ÚNICA fuente de verdad de la forma del contenido.
 * Se usan en tres puntos:
 *   - build (SSG): validar lo que viene de MongoDB antes de renderizar
 *   - dashboard: validar lo que envía el editor antes de escribir
 *   - tipos: `LandingContent` se infiere de aquí, no se declara a mano
 * Los límites de longitud son deliberados: protegen el diseño de textos que
 * rompan la maqueta y, en SEO, los límites reales del SERP.
 */

const cta = z.object({
  label: z.string().min(1).max(60),
  /** Ancla interna (`#agendar`) o URL absoluta (WhatsApp, tel:). */
  href: z.string().min(1).max(300),
});

export const heroSchema = z.object({
  headline: z.string().min(10).max(160),
  subheadline: z.string().min(10).max(320),
  bullets: z.array(z.string().min(3).max(120)).min(1).max(6),
  address: z.string().min(5).max(200),
  cta,
});

const estudio = z.object({
  nombre: z.string().min(3).max(80),
  descripcion: z.string().min(10).max(300),
});

export const estudiosPrincipalesSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  intro: z.string().min(10).max(400),
  estudios: z.array(estudio).min(1).max(12),
  cta,
});

export const porQueEstudiosSchema = z.object({
  eyebrow: z.string().min(1).max(80),
  intro: z.string().min(10).max(600),
  datosLabel: z.string().min(1).max(80),
  datos: z.array(z.string().min(10).max(400)).min(1).max(8),
  cierre: z.string().min(10).max(500),
  cta,
});

export const estudiosAdicionalesSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  intro: z.string().min(10).max(400),
  items: z
    .array(
      z.object({
        titulo: z.string().min(3).max(80),
        detalle: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(20),
  cta,
});

export const porQueHospitalSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  beneficios: z
    .array(
      z.object({
        titulo: z.string().min(3).max(80),
        descripcion: z.string().min(10).max(300),
      }),
    )
    .min(1)
    .max(10),
  cta,
});

export const testimoniosSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  items: z
    .array(
      z.object({
        quote: z.string().min(20).max(500),
        autor: z.string().min(2).max(80),
      }),
    )
    .min(1)
    .max(12),
  cta,
});

export const faqSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  items: z
    .array(
      z.object({
        pregunta: z.string().min(5).max(200),
        respuesta: z.string().min(10).max(800),
      }),
    )
    .min(1)
    .max(20),
  cta,
});

export const ctaFinalSchema = z.object({
  headline: z.string().min(5).max(120),
  body: z.string().min(10).max(400),
  cta,
});

export const avisosSchema = z.object({
  permisoCofepris: z.string().min(1).max(60),
  items: z.array(z.string().min(5).max(300)).max(8),
  privacidadHref: z.string().min(1).max(300),
});

export const seoSchema = z.object({
  /** Límite del SERP de Google: por encima de ~70 caracteres se trunca. */
  title: z.string().min(10).max(70),
  /** Ídem: la metadescripción se corta pasando los ~160. */
  description: z.string().min(50).max(160),
  keywords: z.array(z.string().min(3).max(80)).max(20),
});

export const videosSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  intro: z.string().max(300),
  items: z
    .array(
      z.object({
        // Zod 4: `z.url()` reemplaza al deprecado `z.string().url()`.
        url: z.url().max(300),
        titulo: z.string().min(3).max(120),
        /** Thumbnail local en /public. Vacío -> se renderiza un placeholder. */
        thumbnail: z.string().max(300).default(''),
      }),
    )
    .max(12),
});

export const SECTION_SCHEMAS = {
  hero: heroSchema,
  estudios_principales: estudiosPrincipalesSchema,
  por_que_estudios: porQueEstudiosSchema,
  estudios_adicionales: estudiosAdicionalesSchema,
  por_que_hospital: porQueHospitalSchema,
  testimonios: testimoniosSchema,
  videos: videosSchema,
  faq: faqSchema,
  cta_final: ctaFinalSchema,
  avisos: avisosSchema,
  seo: seoSchema,
} as const;

export type SectionKey = keyof typeof SECTION_SCHEMAS;

/** El orden del objeto define el orden de la landing y del listado del dashboard. */
export const SECTION_KEYS = Object.keys(SECTION_SCHEMAS) as SectionKey[];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: 'Hero',
  estudios_principales: 'Estudios principales',
  por_que_estudios: '¿Por qué hacerte estudios?',
  estudios_adicionales: 'Estudios adicionales',
  por_que_hospital: '¿Por qué en Hospital Cristal?',
  testimonios: 'Testimonios',
  videos: 'Videos de Instagram',
  faq: 'Preguntas frecuentes',
  cta_final: 'CTA final',
  avisos: 'Avisos y confianza',
  seo: 'SEO / Metadatos',
};

export type LandingContent = {
  [K in SectionKey]: z.infer<(typeof SECTION_SCHEMAS)[K]>;
};

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === 'string' && value in SECTION_SCHEMAS;
}
