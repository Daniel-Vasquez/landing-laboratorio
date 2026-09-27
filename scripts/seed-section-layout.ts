/**
 * Crea `landing_config` con el orden ACTUAL de la landing.
 *
 * Se siembra con el orden del registro —que es el que la landing ya muestra—
 * para que la primera ejecución no altere nada de lo que el cliente ve hoy.
 *
 * `$setOnInsert`: correrlo de nuevo no pisa la configuración del administrador.
 *
 * Ejecutar: npm run db:seed-layout
 */
import { getDb, closeMongo } from '../src/lib/mongo.ts';
import { SECTION_REGISTRY } from '../src/lib/sections/registry.ts';

const run = async () => {
  const db = await getDb();
  const collection = db.collection('landing_config');

  const items = SECTION_REGISTRY.map((definition, index) => ({
    id_seccion: definition.key,
    titulo_menu: definition.defaultMenuTitle,
    orden: index,
    isVisible: true,
  }));

  const result = await collection.updateOne(
    { _id: 'sections' as never },
    { $setOnInsert: { items, updatedAt: new Date(), updatedBy: null } },
    { upsert: true },
  );

  if (result.upsertedCount > 0) {
    console.log(`Creada la configuración con ${items.length} secciones:\n`);
    for (const item of items) {
      console.log(`  ${String(item.orden).padStart(2)}  ${item.id_seccion}`);
    }
  } else {
    const existing = await collection.findOne({ _id: 'sections' as never });
    const stored = (existing?.items ?? []) as Array<{ id_seccion: string; isVisible: boolean }>;
    console.log(`Ya existía, sin cambios. ${stored.length} secciones:\n`);
    for (const item of stored) {
      console.log(`  ${item.isVisible ? '👁 ' : '🚫'} ${item.id_seccion}`);
    }
  }

  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
