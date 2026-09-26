/**
 * Crea los índices necesarios. Idempotente: `createIndex` sobre un índice que
 * ya existe con la misma definición no hace nada.
 *
 * Nota: `landing_sections` NO necesita índice único sobre la clave de sección,
 * porque la clave ES el `_id` del documento y MongoDB ya lo indexa como único.
 *
 * Ejecutar: npm run db:indexes
 */
import { getDb, closeMongo } from '../src/lib/mongo.ts';

const run = async () => {
  const db = await getDb();
  console.log(`Conectado a "${db.databaseName}"\n`);

  // Better Auth crea estas colecciones al primer registro (Tanda 4). Los
  // índices se declaran ahora para que no dependan del orden de arranque.
  const results = [
    ['user', await db.collection('user').createIndex({ email: 1 }, { unique: true })],
    ['session', await db.collection('session').createIndex({ token: 1 }, { unique: true })],
    // TTL: MongoDB purga las sesiones expiradas solo, sin cron propio.
    ['session', await db.collection('session').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })],
    ['account', await db.collection('account').createIndex({ userId: 1 })],
  ] as const;

  for (const [collection, name] of results) {
    console.log(`  ✓ ${collection}.${name}`);
  }

  console.log('\nÍndices listos.');
  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error creando índices:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
