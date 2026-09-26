import type { SectionKey } from '../content/schemas.ts';
import type { ImageSlot } from './slots.ts';

/**
 * Repeaters cuyas tarjetas llevan imagen propia.
 *
 * A diferencia de las ranuras fijas de `slots.ts`, aquí el NÚMERO de imágenes
 * sí crece: una por tarjeta, creada al añadir la tarjeta. Lo que sigue estando
 * en código es QUÉ repeaters tienen imagen — añadir imágenes a los testimonios
 * o a las preguntas frecuentes exige un cambio aquí, no una acción del panel.
 */
export type CardImageGroup = {
  section: SectionKey;
  /** Ruta del array dentro del documento de la sección. */
  path: string;
  /** Campo del item que se muestra como título en el panel. */
  titleField: string;
  aspect: '16/9' | '4/3';
  displayWidth: number;
};

export const CARD_IMAGE_GROUPS: readonly CardImageGroup[] = [
  {
    section: 'estudios_principales',
    path: 'estudios',
    titleField: 'nombre',
    aspect: '16/9',
    displayWidth: 420,
  },
] as const;

export function cardGroupFor(section: SectionKey): CardImageGroup | undefined {
  return CARD_IMAGE_GROUPS.find((group) => group.section === section);
}

/**
 * Clave de la ranura de una tarjeta: `<path>:<imageKey>`.
 * Los dos puntos evitan colisión con los ids de las ranuras fijas, que son
 * kebab-case sin separadores.
 */
export function cardSlotKey(group: CardImageGroup, imageKey: string): string {
  return `${group.path}:${imageKey}`;
}

/** `public_id` en Cloudinary para una tarjeta NUEVA. ASCII seguro. */
export function cardPublicId(group: CardImageGroup, imageKey: string): string {
  return `${group.path}-${imageKey}`;
}

/**
 * Construye una ranura sintética para una tarjeta, con la misma forma que las
 * fijas, para que `SlotImage` e `ImageSlotField` funcionen con ambas sin saber
 * de cuál se trata.
 */
export function cardSlot(
  group: CardImageGroup,
  imageKey: string,
  title: string,
  publicId?: string,
): ImageSlot {
  return {
    id: cardSlotKey(group, imageKey),
    publicId: publicId ?? cardPublicId(group, imageKey),
    section: group.section,
    label: title,
    placement: 'card-top',
    aspect: group.aspect,
    displayWidth: group.displayWidth,
    // Cadena vacía, no null: la imagen de una tarjeta es informativa, así que
    // el panel exige texto alternativo.
    altDefault: '',
  };
}

/** Identificador corto, aleatorio y estable para una tarjeta nueva. */
export function newImageKey(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
