import type { SectionKey } from '../../lib/content/schemas.ts';

/**
 * Descriptor de campos por sección.
 *
 * El formulario se genera desde AQUÍ, no por introspección de los esquemas Zod.
 * Derivar la UI del esquema suena elegante pero es frágil: un `z.string()` no
 * dice si debe ser un input de una línea o un textarea de seis, ni qué etiqueta
 * en español le corresponde, ni en qué orden aparecen los campos. Este mapa
 * mantiene esas decisiones de presentación explícitas y legibles.
 *
 * Zod sigue siendo la autoridad sobre la VALIDEZ; este mapa solo describe la
 * PRESENTACIÓN. Si divergen, el guardado falla con el error de Zod, que es el
 * comportamiento correcto.
 */
export type Field =
  | { kind: 'text'; path: string; label: string; max?: number; hint?: string }
  | { kind: 'textarea'; path: string; label: string; max?: number; rows?: number; hint?: string }
  | { kind: 'url'; path: string; label: string; hint?: string }
  /**
   * Selector de icono + colores. El valor viaja DENTRO de `data`, así que se
   * guarda con el resto del formulario y no necesita una action propia.
   */
  | { kind: 'icon'; path: string; label: string; hint?: string }
  | {
      kind: 'list';
      path: string;
      label: string;
      itemLabel: string;
      max: number;
      itemKind?: 'text' | 'textarea';
      itemMax?: number;
      hint?: string;
    }
  | {
      kind: 'repeater';
      path: string;
      label: string;
      itemLabel: string;
      max: number;
      /** Rutas RELATIVAS al item (se les antepone `path.<índice>.`). */
      fields: Field[];
      /** Campo del item que se usa como título de la tarjeta al colapsarla. */
      titleField: string;
      hint?: string;
    };

const CTA_FIELDS: Field[] = [
  { kind: 'text', path: 'cta.label', label: 'Texto del botón', max: 60 },
  {
    kind: 'text',
    path: 'cta.href',
    label: 'Destino del botón',
    max: 300,
    hint: 'Ancla interna (#agendar) o URL completa (https://wa.me/52..., tel:+52...).',
  },
];

export const FIELD_MAP: Record<SectionKey, Field[]> = {
  hero: [
    { kind: 'textarea', path: 'headline', label: 'Titular principal (H1)', max: 160, rows: 3 },
    { kind: 'textarea', path: 'subheadline', label: 'Subtítulo', max: 320, rows: 3 },
    {
      kind: 'list',
      path: 'bullets',
      label: 'Puntos destacados',
      itemLabel: 'Punto',
      max: 6,
      itemMax: 120,
      hint: 'Se muestran en tarjetas. Tres funcionan mejor que cinco.',
    },
    { kind: 'text', path: 'address', label: 'Dirección', max: 200 },
    ...CTA_FIELDS,
  ],

  estudios_principales: [
    { kind: 'text', path: 'eyebrow', label: 'Etiqueta de sección', max: 60 },
    { kind: 'textarea', path: 'intro', label: 'Texto introductorio', max: 400, rows: 3 },
    {
      kind: 'repeater',
      path: 'estudios',
      label: 'Estudios',
      itemLabel: 'Estudio',
      max: 12,
      titleField: 'nombre',
      fields: [
        { kind: 'text', path: 'nombre', label: 'Nombre del estudio', max: 80 },
        { kind: 'textarea', path: 'descripcion', label: 'Descripción', max: 300, rows: 3 },
      ],
    },
    ...CTA_FIELDS,
  ],

  por_que_estudios: [
    { kind: 'text', path: 'eyebrow', label: 'Título de la sección', max: 80 },
    { kind: 'textarea', path: 'intro', label: 'Texto introductorio', max: 600, rows: 5 },
    { kind: 'text', path: 'datosLabel', label: 'Encabezado de los datos', max: 80 },
    {
      kind: 'list',
      path: 'datos',
      label: 'Datos estadísticos',
      itemLabel: 'Dato',
      max: 8,
      itemKind: 'textarea',
      itemMax: 400,
      hint: 'Cita cifras verificables. Un dato incorrecto sobre salud es un riesgo real.',
    },
    { kind: 'textarea', path: 'cierre', label: 'Texto de cierre', max: 500, rows: 3 },
    ...CTA_FIELDS,
  ],

  estudios_adicionales: [
    { kind: 'text', path: 'eyebrow', label: 'Etiqueta de sección', max: 60 },
    { kind: 'textarea', path: 'intro', label: 'Texto introductorio', max: 400, rows: 3 },
    {
      kind: 'repeater',
      path: 'items',
      label: 'Categorías de estudios',
      itemLabel: 'Categoría',
      max: 20,
      titleField: 'titulo',
      fields: [
        { kind: 'text', path: 'titulo', label: 'Título', max: 80 },
        { kind: 'text', path: 'detalle', label: 'Detalle', max: 200 },
        { kind: 'icon', path: 'icon', label: 'Icono' },
      ],
    },
    ...CTA_FIELDS,
  ],

  por_que_hospital: [
    { kind: 'text', path: 'eyebrow', label: 'Título de la sección', max: 60 },
    {
      kind: 'repeater',
      path: 'beneficios',
      label: 'Beneficios',
      itemLabel: 'Beneficio',
      max: 10,
      titleField: 'titulo',
      hint: 'Los seis primeros llevan un icono propio; los siguientes usan uno genérico.',
      fields: [
        { kind: 'text', path: 'titulo', label: 'Título', max: 80 },
        { kind: 'textarea', path: 'descripcion', label: 'Descripción', max: 300, rows: 3 },
        { kind: 'icon', path: 'icon', label: 'Icono' },
      ],
    },
    ...CTA_FIELDS,
  ],

  testimonios: [
    { kind: 'text', path: 'eyebrow', label: 'Etiqueta de sección', max: 60 },
    {
      kind: 'repeater',
      path: 'items',
      label: 'Testimonios',
      itemLabel: 'Testimonio',
      max: 12,
      titleField: 'autor',
      hint: 'Transcribe reseñas reales. Inventarlas es publicidad engañosa.',
      fields: [
        { kind: 'textarea', path: 'quote', label: 'Testimonio', max: 500, rows: 4 },
        { kind: 'text', path: 'autor', label: 'Nombre del paciente', max: 80 },
      ],
    },
    ...CTA_FIELDS,
  ],

  videos: [
    { kind: 'text', path: 'eyebrow', label: 'Etiqueta de sección', max: 60 },
    { kind: 'text', path: 'intro', label: 'Texto introductorio', max: 300 },
    {
      kind: 'repeater',
      path: 'items',
      label: 'Videos',
      itemLabel: 'Video',
      max: 12,
      titleField: 'titulo',
      hint: 'Sin miniatura se muestra un degradado. Sube las imágenes a /public/videos/.',
      fields: [
        { kind: 'url', path: 'url', label: 'Enlace del post de Instagram' },
        { kind: 'text', path: 'titulo', label: 'Título (texto accesible)', max: 120 },
        {
          kind: 'text',
          path: 'thumbnail',
          label: 'Miniatura',
          max: 300,
          hint: 'Ruta local, por ejemplo /videos/laboratorio.avif. Déjalo vacío si no la tienes.',
        },
      ],
    },
  ],

  faq: [
    { kind: 'text', path: 'eyebrow', label: 'Etiqueta de sección', max: 60 },
    {
      kind: 'repeater',
      path: 'items',
      label: 'Preguntas',
      itemLabel: 'Pregunta',
      max: 20,
      titleField: 'pregunta',
      fields: [
        { kind: 'text', path: 'pregunta', label: 'Pregunta', max: 200 },
        { kind: 'textarea', path: 'respuesta', label: 'Respuesta', max: 800, rows: 4 },
      ],
    },
    ...CTA_FIELDS,
  ],

  cta_final: [
    { kind: 'text', path: 'headline', label: 'Titular', max: 120 },
    { kind: 'textarea', path: 'body', label: 'Texto', max: 400, rows: 3 },
    ...CTA_FIELDS,
  ],

  avisos: [
    { kind: 'text', path: 'permisoCofepris', label: 'Permiso COFEPRIS', max: 60 },
    {
      kind: 'list',
      path: 'items',
      label: 'Avisos legales',
      itemLabel: 'Aviso',
      max: 8,
      itemKind: 'textarea',
      itemMax: 300,
    },
    { kind: 'text', path: 'privacidadHref', label: 'Enlace al aviso de privacidad', max: 300 },
  ],

  seo: [
    {
      kind: 'text',
      path: 'title',
      label: 'Título SEO',
      max: 70,
      hint: 'Google trunca pasando los ~70 caracteres. El sufijo "| Hospital Cristal" se añade automáticamente.',
    },
    {
      kind: 'textarea',
      path: 'description',
      label: 'Metadescripción',
      max: 160,
      rows: 3,
      hint: 'Entre 50 y 160 caracteres. Por encima, Google la corta.',
    },
    {
      kind: 'list',
      path: 'keywords',
      label: 'Palabras clave',
      itemLabel: 'Palabra clave',
      max: 20,
      itemMax: 80,
    },
  ],
};

/** Valor vacío para un item nuevo de repeater, derivado de sus campos. */
export function emptyItem(fields: Field[]): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.kind === 'list' || field.kind === 'repeater') item[field.path] = [];
    // `icon` se deja SIN definir: el esquema lo tiene como opcional y un string
    // vacío no validaría. El picker lo rellena cuando el editor lo elige.
    else if (field.kind !== 'icon') item[field.path] = '';
  }
  return item;
}
