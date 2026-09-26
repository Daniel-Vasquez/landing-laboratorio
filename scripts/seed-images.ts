/**
 * Sincroniza `landing_images` con lo que ya existe en Cloudinary.
 *
 * Los assets se subieron a mano a la carpeta antes de que existiera el panel,
 * así que la base no tiene sus metadatos. Este script los lee de la Admin API y
 * crea las filas que faltan.
 *
 * Los metadatos TÉCNICOS (version, width, height, format, bytes) se
 * sincronizan siempre con `$set`: reflejan el asset real y deben seguirlo.
 * El `alt` va con `$setOnInsert`, así que ejecutarlo de nuevo NO pisa el texto
 * alternativo que haya escrito el administrador.
 *
 * Ejecutar: npm run db:seed-images
 */
import { requireEnv } from '../src/lib/env.ts';
import { getImagesCollection, closeMongo } from '../src/lib/mongo.ts';
import { IMAGE_SLOTS } from '../src/lib/images/slots.ts';

type CloudinaryResource = {
  public_id: string;
  version: number;
  width: number;
  height: number;
  format: string;
  bytes: number;
};

async function listFolder(): Promise<Map<string, CloudinaryResource>> {
  const cloud = requireEnv('CLOUDINARY_CLOUD_NAME');
  const folder = requireEnv('CLOUDINARY_FOLDER');
  const auth = Buffer.from(
    `${requireEnv('CLOUDINARY_API_KEY')}:${requireEnv('CLOUDINARY_API_SECRET')}`,
  ).toString('base64');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/resources/search`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expression: `asset_folder="${folder}"`, max_results: 100 }),
  });

  if (!response.ok) {
    throw new Error(`Cloudinary respondió ${response.status}: ${await response.text()}`);
  }

  const { resources } = (await response.json()) as { resources: CloudinaryResource[] };
  // NFC: los public_id llevan acentos y macOS produce NFD al copiar nombres.
  return new Map(resources.map((r) => [r.public_id.normalize('NFC'), r]));
}

const run = async () => {
  const assets = await listFolder();
  console.log(`Cloudinary: ${assets.size} imagen(es) en la carpeta\n`);

  const collection = await getImagesCollection();
  let synced = 0;
  const missing: string[] = [];

  for (const slot of IMAGE_SLOTS) {
    const asset = assets.get(slot.publicId.normalize('NFC'));
    if (!asset) {
      missing.push(`${slot.id}  (esperaba public_id "${slot.publicId}")`);
      console.log(`  ✗ ${slot.id.padEnd(34)} sin asset`);
      continue;
    }

    await collection.updateOne(
      { _id: slot.id },
      {
        $set: {
          publicId: asset.public_id.normalize('NFC'),
          version: asset.version,
          width: asset.width,
          height: asset.height,
          format: asset.format,
          bytes: asset.bytes,
          updatedAt: new Date(),
        },
        // No pisa el alt escrito desde el panel ni el autor de la última edición.
        // `altDefault ?? ''`: las ranuras decorativas (fondo) llevan alt vacío
        // a propósito, para que los lectores de pantalla las ignoren.
        $setOnInsert: { alt: slot.altDefault ?? '', updatedBy: null },
      },
      { upsert: true },
    );
    synced++;
    console.log(`  ✓ ${slot.id.padEnd(34)} ${asset.width}x${asset.height} ${asset.format}`);
  }

  console.log(`\nSincronizadas: ${synced}/${IMAGE_SLOTS.length}`);
  if (missing.length > 0) {
    console.log('\nRanuras sin imagen en Cloudinary (renderizarán placeholder):');
    for (const m of missing) console.log(`  - ${m}`);
  }
  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
