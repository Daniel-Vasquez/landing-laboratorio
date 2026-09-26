import type { LandingContent } from './content/schemas.ts';

/**
 * JSON-LD de negocio médico.
 *
 * DECISIÓN DELIBERADA: se emite `review[]` pero NO `aggregateRating`.
 * Publicar una calificación agregada a partir de 3 testimonios transcritos a
 * mano, sin fuente verificable ni conteo real de reseñas, es exactamente lo que
 * Google penaliza como rich snippet fabricado. `review[]` sin agregado es la
 * opción segura y sigue siendo elegible para marcado.
 *
 * Campos omitidos por falta de dato del cliente: `telephone`, `openingHours`,
 * `priceRange`. Es mejor omitirlos que inventarlos: un teléfono incorrecto en
 * datos estructurados llega a Google Maps y al Knowledge Panel.
 */
export function buildJsonLd(content: LandingContent, siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': ['MedicalBusiness', 'MedicalClinic'],
    name: 'Laboratorio Clínico Hospital Cristal',
    description: content.seo.description,
    url: siteUrl,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Melchor Ocampo 233, Santiago 1ra Secc',
      addressLocality: 'Zumpango',
      addressRegion: 'Estado de México',
      addressCountry: 'MX',
    },
    medicalSpecialty: 'https://schema.org/DiagnosticLab',
    availableService: content.estudios_principales.estudios.map((estudio) => ({
      '@type': 'MedicalTest',
      name: estudio.nombre,
      description: estudio.descripcion,
    })),
    review: content.testimonios.items.map((item) => ({
      '@type': 'Review',
      reviewBody: item.quote,
      author: { '@type': 'Person', name: item.autor },
    })),
  };
}
