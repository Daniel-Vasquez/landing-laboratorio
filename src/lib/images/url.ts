import { requireEnv } from '../env.ts';
import type { ImageSlot } from './slots.ts';
import type { ImageDoc } from './types.ts';

/**
 * Construcción de URLs de entrega de Cloudinary.
 *
 * Las URLs se construyen AQUÍ y no se guardan en la base. Una URL almacenada
 * congelaría las transformaciones dentro del dato: cambiar el ancho de una
 * tarjeta, o pasar a servir AVIF, exigiría migrar documentos. Con el
 * `publicId` guardado, un cambio de diseño no toca MongoDB.
 */

/**
 * `f_auto` entrega AVIF o WebP según lo que soporte el navegador, así que una
 * imagen subida como JPEG se sirve optimizada igualmente. `q_auto` ajusta la
 * compresión al contenido. `c_limit` nunca amplía por encima del original.
 */
const BASE_TRANSFORM = 'f_auto,q_auto,c_limit';

function cloudName(): string {
  return requireEnv('CLOUDINARY_CLOUD_NAME');
}

/**
 * Los `public_id` llevan acentos y mayúsculas (`Biometría_Hemática`), así que
 * hay que percent-encodearlos. Se normalizan a NFC primero: la misma cadena en
 * NFD es un identificador distinto para Cloudinary.
 */
function encodePublicId(publicId: string): string {
  return publicId
    .normalize('NFC')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function cloudinaryUrl(
  image: Pick<ImageDoc, 'publicId' | 'version'>,
  width: number,
  extraTransform?: string,
): string {
  const transform = [BASE_TRANSFORM, `w_${Math.round(width)}`, extraTransform]
    .filter(Boolean)
    .join(',');
  return [
    `https://res.cloudinary.com/${cloudName()}/image/upload`,
    transform,
    `v${image.version}`,
    encodePublicId(image.publicId),
  ].join('/');
}

/** Anchos 1x, 1.5x y 2x, limitados al ancho real del original. */
export function cloudinarySrcSet(
  image: Pick<ImageDoc, 'publicId' | 'version' | 'width'>,
  slot: ImageSlot,
  extraTransform?: string,
): string {
  const widths = [slot.displayWidth, slot.displayWidth * 1.5, slot.displayWidth * 2]
    .map((w) => Math.round(w))
    .filter((w) => w <= image.width || w === slot.displayWidth);

  return [...new Set(widths)]
    .map((w) => `${cloudinaryUrl(image, w, extraTransform)} ${w}w`)
    .join(', ');
}

/** Alto renderizado, derivado de la proporción del slot. Evita el CLS. */
export function slotDimensions(slot: ImageSlot): { width: number; height: number } {
  const [w, h] = slot.aspect.split('/').map(Number);
  return {
    width: slot.displayWidth,
    height: Math.round((slot.displayWidth * h!) / w!),
  };
}
