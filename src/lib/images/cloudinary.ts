import { createHash } from 'node:crypto';
import { requireEnv } from '../env.ts';
import type { UploadedImage } from './repository.ts';

/** Solo estos cuatro. SVG queda fuera: puede contener <script>. */
export const ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp';
export const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Detecta el formato real leyendo la cabecera del archivo.
 *
 * NO se confía en la extensión ni en el `Content-Type`: ambos los controla el
 * cliente. Un SVG con `<script>` renombrado a `.png` pasaría cualquier
 * comprobación basada en el nombre.
 */
export function sniffImageType(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png';

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';

  // WebP: "RIFF" .... "WEBP"
  const ascii = (i: number, s: string) =>
    [...s].every((c, k) => bytes[i + k] === c.charCodeAt(0));
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';

  return null;
}

/**
 * Sube reemplazando el asset de una ranura.
 *
 * Firma la petición en el servidor con el API secret. Una subida sin firmar
 * desde el navegador expondría un upload preset abierto y permitiría a
 * cualquiera llenar la cuenta.
 */
export async function uploadToSlot(
  publicId: string,
  file: Uint8Array,
  filename: string,
): Promise<UploadedImage> {
  const cloud = requireEnv('CLOUDINARY_CLOUD_NAME');
  const apiKey = requireEnv('CLOUDINARY_API_KEY');
  const apiSecret = requireEnv('CLOUDINARY_API_SECRET');
  const folder = requireEnv('CLOUDINARY_FOLDER');

  const timestamp = Math.floor(Date.now() / 1000);

  /**
   * La cuenta usa CARPETAS DINÁMICAS: la carpeta va en `asset_folder` y el
   * `public_id` no lleva prefijo. Sin `asset_folder`, el reemplazo aterrizaría
   * en la raíz de la cuenta y el asset de la carpeta quedaría intacto — el
   * administrador vería "guardado" y la web no cambiaría nunca.
   */
  const params: Record<string, string> = {
    asset_folder: folder,
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId.normalize('NFC'),
    timestamp: String(timestamp),
  };

  // La firma es el SHA-1 de los parámetros ordenados alfabéticamente + secret.
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const signature = createHash('sha1').update(toSign + apiSecret).digest('hex');

  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append('api_key', apiKey);
  form.append('signature', signature);
  form.append('file', new Blob([file as BlobPart]), filename);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloudinary respondió ${response.status}. ${body.slice(0, 200)}`);
  }

  const result = (await response.json()) as {
    public_id: string;
    version: number;
    width: number;
    height: number;
    format: string;
    bytes: number;
  };

  return {
    publicId: result.public_id.normalize('NFC'),
    version: result.version,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}
