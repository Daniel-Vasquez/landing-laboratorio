import type { SectionKey } from '../content/schemas.ts';

/**
 * Registro CERRADO de ranuras de imagen FIJAS.
 *
 * Aquí viven las secciones con UNA imagen cuya cantidad no cambia nunca. Las
 * imágenes de tarjeta (una por item de un grid) son dinámicas y se declaran en
 * `cards.ts`: crecen con las tarjetas, pero QUÉ repeaters las tienen sigue
 * decidiéndose en código.
 *
 * Este archivo es la razón por la que "solo reemplazar, nunca añadir" es una
 * garantía estructural y no una convención de la interfaz: el conjunto de
 * ranuras vive en código, así que crear una exige un despliegue. La action de
 * subida rechaza cualquier id que no esté aquí, y la landing solo renderiza
 * ranuras de esta lista.
 */

export type Placement = 'aside-right' | 'card-top' | 'section-background';

export type ImageSlot = {
  /** Id estable: se usa en el panel y como `_id` en `landing_images`. */
  id: string;
  /**
   * `public_id` REAL en Cloudinary, declarado en lugar de derivado de `id`.
   *
   * Los assets ya existen con nombres en español y acentuados. Derivar el
   * public_id del id del slot haría que el primer reemplazo subiera a un
   * identificador distinto del actual y dejara el original huérfano.
   *
   * NOTA: la cuenta usa carpetas dinámicas, así que NO lleva prefijo de carpeta.
   * La carpeta se pasa aparte, en `asset_folder`.
   */
  publicId: string;
  section: SectionKey;
  /** Etiqueta del panel. Debe nombrar la tarjeta o el bloque concreto. */
  label: string;
  /**
   * Texto alternativo por defecto: describe el CONTENIDO de la imagen actual,
   * no su posición. El administrador puede reescribirlo desde el panel, y el
   * seed no lo pisa (`$setOnInsert`).
   *
   * `null` marca la imagen como decorativa: se emite `alt=""` para que los
   * lectores de pantalla la ignoren, que es lo correcto cuando no aporta
   * información — describirla solo añadiría ruido.
   */
  altDefault: string | null;
  placement: Placement;
  aspect: '4/3' | '16/9';
  /** Ancho máximo al que se muestra. Base del srcset. */
  displayWidth: number;
};

export const IMAGE_SLOTS: readonly ImageSlot[] = [
  {
    id: 'hero',
    publicId: 'hero',
    section: 'hero',
    label: 'Imagen del hero (lado derecho)',
    altDefault:
      'Familia de tres generaciones conversando y sonriendo, sentada en la terraza ajardinada del hospital',
    placement: 'aside-right',
    aspect: '4/3',
    displayWidth: 640,
  },
  {
    id: 'deteccion-oportuna',
    publicId: 'Detección_Oportuna',
    section: 'por_que_estudios',
    label: 'Imagen de Detección oportuna (lado derecho)',
    altDefault:
      'Hombre adulto corriendo por un sendero arbolado mientras una doctora camina al fondo',
    placement: 'aside-right',
    aspect: '16/9',
    displayWidth: 560,
  },
  {
    id: 'cta-final',
    // PENDIENTE: este asset todavía no existe en Cloudinary (la carpeta tiene 9
    // imágenes para 10 ranuras). Hasta que se suba, la sección renderiza su
    // placeholder, que es el comportamiento previsto para una ranura vacía.
    publicId: 'Tu_salud_no_puede_esperar',
    section: 'cta_final',
    label: 'Imagen de Tu salud no puede esperar (lado derecho)',
    altDefault:
      'Profesional de la salud sosteniendo con ambas manos la mano de una persona mayor sobre una mesa',
    placement: 'aside-right',
    aspect: '16/9',
    displayWidth: 560,
  },
  {
    id: 'faq-fondo',
    publicId: 'Preguntas_Frecuentes',
    section: 'faq',
    label: 'Fondo de la sección de Preguntas frecuentes',
    altDefault:
      null,
    placement: 'section-background',
    aspect: '16/9',
    displayWidth: 1600,
  },
] as const;

export const SLOT_IDS: readonly string[] = IMAGE_SLOTS.map((slot) => slot.id);

export function isSlotId(value: unknown): value is string {
  return typeof value === 'string' && SLOT_IDS.includes(value);
}

export function getSlot(id: string): ImageSlot | undefined {
  return IMAGE_SLOTS.find((slot) => slot.id === id);
}

/** Ranuras de una sección, para agruparlas en el editor. */
export function slotsForSection(section: SectionKey): ImageSlot[] {
  return IMAGE_SLOTS.filter((slot) => slot.section === section);
}

