/**
 * Puebla `landing_sections` con el contenido de src/lib/content/seed.ts.
 *
 * Usa `$setOnInsert`, NO `$set`: correr el seed dos veces no debe pisar las
 * ediciones que el cliente haya hecho desde el dashboard. Para forzar la
 * sobrescritura de una sección hay que borrar su documento a mano.
 *
 * Ejecutar: npm run db:seed
 */
import { getSectionsCollection, closeMongo } from '../src/lib/mongo.ts';
import { SECTION_KEYS, SECTION_SCHEMAS } from '../src/lib/content/schemas.ts';
import { SEED } from '../src/lib/content/seed.ts';

const run = async () => {
  // Validar ANTES de escribir: nunca insertar contenido que la landing
  // luego rechazaría al renderizar.
  const invalid: string[] = [];
  for (const key of SECTION_KEYS) {
    const result = SECTION_SCHEMAS[key].safeParse(SEED[key]);
    if (!result.success) {
      invalid.push(
        `${key}: ${result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`,
      );
    }
  }
  if (invalid.length > 0) {
    console.error('✗ El contenido semilla no valida. No se escribió nada:\n');
    for (const line of invalid) console.error(`  - ${line}`);
    process.exit(1);
  }

  const collection = await getSectionsCollection();
  const now = new Date();
  let inserted = 0;
  let untouched = 0;

  for (const key of SECTION_KEYS) {
    const result = await collection.updateOne(
      { _id: key },
      { $setOnInsert: { data: SEED[key], updatedAt: now, updatedBy: null } },
      { upsert: true },
    );
    if (result.upsertedCount > 0) {
      inserted++;
      console.log(`  + ${key}`);
    } else {
      untouched++;
      console.log(`  = ${key} (ya existía, sin cambios)`);
    }
  }

  console.log(`\nInsertadas: ${inserted} · Sin tocar: ${untouched} · Total: ${SECTION_KEYS.length}`);
  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error en el seed:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
