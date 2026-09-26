/** Documento de `landing_images`. `_id` es el `slotId` del registro. */
export type ImageDoc = {
  _id: string;
  /** `public_id` en Cloudinary, sin prefijo de carpeta (carpetas dinámicas). */
  publicId: string;
  /** Versión de Cloudinary. Va en la URL para invalidar la caché al reemplazar. */
  version: number;
  width: number;
  height: number;
  format: string;
  bytes: number;
  /** Texto alternativo. Obligatorio salvo en ranuras decorativas de fondo. */
  alt: string;
  updatedAt: Date;
  updatedBy: { userId: string; name: string; email: string } | null;
};
