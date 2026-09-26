import { getImagesCollection, isMongoConfigured } from '../mongo.ts';
import { IMAGE_SLOTS, type ImageSlot } from './slots.ts';
import { CARD_IMAGE_GROUPS } from './cards.ts';
import type { ImageDoc } from './types.ts';

export type Editor = { userId: string; name: string; email: string };

/** Mapa slotId -> documento. Las ranuras sin imagen simplemente no aparecen. */
export type LandingImages = Record<string, ImageDoc>;

/**
 * Lee las imágenes con UNA sola query.
 *
 * Misma política tolerante que el contenido (Tanda 2): si Atlas falla durante
 * el build, se devuelve un mapa vacío y las secciones renderizan sus
 * placeholders. La landing NUNCA depende de que una imagen exista, así que un
 * incidente de base de datos degrada el diseño en lugar de romper el deploy.
 */
export async function getLandingImages(): Promise<LandingImages> {
  if (!isMongoConfigured()) return {};

  try {
    const collection = await getImagesCollection();
    const docs = await collection.find({}).toArray();
    const byId: LandingImages = {};
    for (const doc of docs) {
      /**
       * Se aceptan dos formas de clave:
       *  - ranura FIJA: tiene que seguir en el registro. Si se retira del
       *    código, su fila deja de renderizarse.
       *  - ranura de TARJETA (`<path>:<imageKey>`): basta con que su grupo siga
       *    declarado. Cuál tarjeta la usa lo decide el componente, cruzando con
       *    el `imageKey` del contenido; una fila huérfana (tarjeta borrada)
       *    simplemente no la reclama nadie.
       */
      const isFixed = IMAGE_SLOTS.some((slot) => slot.id === doc._id);
      const isCard = CARD_IMAGE_GROUPS.some((group) => doc._id.startsWith(`${group.path}:`));
      if (isFixed || isCard) byId[doc._id] = doc;
    }
    return byId;
  } catch (error) {
    console.warn(
      `[images] No se pudieron leer las imágenes, se renderizan placeholders. ` +
        `Causa: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

/** Metadatos de Cloudinary tras una subida. */
export type UploadedImage = {
  publicId: string;
  version: number;
  width: number;
  height: number;
  format: string;
  bytes: number;
};

export async function setSlotImage(
  slot: ImageSlot,
  uploaded: UploadedImage,
  alt: string,
  editor: Editor,
): Promise<void> {
  const collection = await getImagesCollection();
  await collection.updateOne(
    { _id: slot.id },
    {
      $set: {
        publicId: uploaded.publicId,
        version: uploaded.version,
        width: uploaded.width,
        height: uploaded.height,
        format: uploaded.format,
        bytes: uploaded.bytes,
        alt,
        updatedAt: new Date(),
        updatedBy: editor,
      },
    },
    { upsert: true },
  );
}

/** Solo el texto alternativo, sin resubir la imagen. */
export async function setSlotAlt(slotId: string, alt: string, editor: Editor): Promise<void> {
  const collection = await getImagesCollection();
  await collection.updateOne(
    { _id: slotId },
    { $set: { alt, updatedAt: new Date(), updatedBy: editor } },
  );
}
