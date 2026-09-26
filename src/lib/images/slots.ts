import type { SectionKey } from '../content/schemas.ts';

/**
 * Registro CERRADO de ranuras de imagen.
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
  /**
   * Solo para `card-top`: nombre canónico de la tarjeta a la que pertenece.
   * El emparejamiento es por nombre normalizado, NO por posición en el array:
   * reordenar los estudios desde el panel no debe descolocar las imágenes.
   */
  cardName?: string;
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
    id: 'estudio-biometria-hematica',
    publicId: 'Biometría_Hemática',
    section: 'estudios_principales',
    label: 'Tarjeta: Biometría hemática',
    altDefault:
      'Mano con guante azul colocando un tubo con muestra de sangre en una centrifugadora de laboratorio',
    placement: 'card-top',
    aspect: '16/9',
    displayWidth: 420,
    cardName: 'Biometría hemática',
  },
  {
    id: 'estudio-quimica-sanguinea',
    publicId: 'Química_Sanguínea',
    section: 'estudios_principales',
    label: 'Tarjeta: Química sanguínea',
    altDefault:
      'Analizador automático de laboratorio dosificando muestras en una bandeja circular de viales',
    placement: 'card-top',
    aspect: '16/9',
    displayWidth: 420,
    cardName: 'Química sanguínea',
  },
  {
    id: 'estudio-examen-orina',
    publicId: 'Examen_General_de_Orina',
    section: 'estudios_principales',
    label: 'Tarjeta: Examen general de orina',
    altDefault:
      'Frasco estéril etiquetado para muestra de orina sobre la mesa de un laboratorio, junto a un soporte de micropipetas',
    placement: 'card-top',
    aspect: '16/9',
    displayWidth: 420,
    cardName: 'Examen general de orina',
  },
  {
    id: 'estudio-hemoglobina-glucosilada',
    publicId: 'Hemoglobina_Glucosilada',
    section: 'estudios_principales',
    label: 'Tarjeta: Hemoglobina glucosilada',
    altDefault:
      'Médico mostrando resultados en una tableta a una paciente sonriente durante la consulta',
    placement: 'card-top',
    aspect: '16/9',
    displayWidth: 420,
    cardName: 'Hemoglobina glucosilada',
  },
  {
    id: 'estudio-perfil-lipidos',
    publicId: 'Perfil_de_Lípidos',
    section: 'estudios_principales',
    label: 'Tarjeta: Perfil de lípidos',
    altDefault:
      'Manos apoyadas en una mesa de madera junto a medio aguacate y un cuenco de nueces',
    placement: 'card-top',
    aspect: '16/9',
    displayWidth: 420,
    cardName: 'Perfil de lípidos',
  },
  {
    id: 'estudio-perfil-tiroideo',
    publicId: 'Perfil_Tiroideo',
    section: 'estudios_principales',
    label: 'Tarjeta: Perfil tiroideo',
    altDefault:
      'Ilustración anatómica de la glándula tiroides sobre una mesa de laboratorio, junto a una figura de mariposa de cristal',
    placement: 'card-top',
    aspect: '16/9',
    displayWidth: 420,
    cardName: 'Perfil tiroideo',
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
      null,
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

/**
 * Normaliza un nombre de tarjeta para emparejarlo con `cardName`.
 * Quita acentos y unifica caja y espacios, así que "Biometría Hemática" y
 * "biometria hematica" emparejan con la misma ranura.
 */
export function normalizeCardName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const CARD_SLOTS_BY_NAME = new Map(
  IMAGE_SLOTS.filter((slot) => slot.cardName).map((slot) => [
    normalizeCardName(slot.cardName!),
    slot,
  ]),
);

/** Ranura de una tarjeta por su nombre. `undefined` si la tarjeta no tiene. */
export function slotForCardName(name: string): ImageSlot | undefined {
  return CARD_SLOTS_BY_NAME.get(normalizeCardName(name));
}
