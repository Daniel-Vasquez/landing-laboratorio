/**
 * Migra las imágenes de tarjeta de "emparejadas por nombre" a "emparejadas por
 * imageKey".
 *
 * Antes, cada estudio encontraba su imagen normalizando su nombre contra una
 * ranura fija en código (`estudio-perfil-tiroideo`). Ahora cada tarjeta lleva un
 * `imageKey` inmutable y su fila vive en `estudios:<imageKey>`.
 *
 * NO se resuben ni se renombran assets: la fila conserva el `publicId` original
 * (`Perfil_Tiroideo`, con acentos), así que las imágenes de Cloudinary quedan
 * intactas y no se crean huérfanos.
 *
 * Idempotente: una tarjeta que ya tiene `imageKey` se deja como está.
 *
 * Ejecutar: npm run db:migrate-card-images
 */
import { getSectionsCollection, getImagesCollection, closeMongo } from '../src/lib/mongo.ts';
import { cardSlotKey, newImageKey, CARD_IMAGE_GROUPS } from '../src/lib/images/cards.ts';

/** Ranuras fijas antiguas, por nombre de tarjeta. Solo para esta migración. */
const LEGACY_BY_NAME: Record<string, string> = {
  'biometria hematica': 'estudio-biometria-hematica',
  'quimica sanguinea': 'estudio-quimica-sanguinea',
  'examen general de orina': 'estudio-examen-orina',
  'hemoglobina glucosilada': 'estudio-hemoglobina-glucosilada',
  'perfil de lipidos': 'estudio-perfil-lipidos',
  'perfil tiroideo': 'estudio-perfil-tiroideo',
};

const normalize = (name: string) =>
  name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const run = async () => {
  const sections = await getSectionsCollection();
  const images = await getImagesCollection();

  for (const group of CARD_IMAGE_GROUPS) {
    const doc = await sections.findOne({ _id: group.section });
    if (!doc) {
      console.log(`  ✗ sección "${group.section}" no existe`);
      continue;
    }

    const data = doc.data as Record<string, unknown>;
    const items = data[group.path] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(items)) continue;

    console.log(`\nSección "${group.section}" · ${items.length} tarjeta(s)\n`);
    let assigned = 0;
    let moved = 0;

    const next = [];
    for (const item of items) {
      if (typeof item.imageKey === 'string') {
        console.log(`  = ${String(item[group.titleField])} (ya migrada)`);
        next.push(item);
        continue;
      }

      const imageKey = newImageKey();
      assigned++;
      next.push({ ...item, imageKey });

      // Mover la fila de la ranura antigua a la nueva, conservando el publicId.
      const legacyId = LEGACY_BY_NAME[normalize(String(item[group.titleField] ?? ''))];
      const legacy = legacyId ? await images.findOne({ _id: legacyId }) : null;

      if (legacy) {
        const { _id, ...rest } = legacy;
        await images.updateOne(
          { _id: cardSlotKey(group, imageKey) },
          { $set: rest },
          { upsert: true },
        );
        await images.deleteOne({ _id: legacyId });
        moved++;
        console.log(
          `  ✓ ${String(item[group.titleField])}  ${legacyId} -> ${cardSlotKey(group, imageKey)}  (publicId "${legacy.publicId}" intacto)`,
        );
      } else {
        console.log(`  + ${String(item[group.titleField])}  imageKey asignado, sin imagen previa`);
      }
    }

    await sections.updateOne({ _id: group.section }, { $set: { [`data.${group.path}`]: next } });
    console.log(`\n  imageKey asignados: ${assigned} · filas movidas: ${moved}`);
  }

  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
