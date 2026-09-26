import { MongoClient, type Collection, type Db } from 'mongodb';
import { optionalEnv, requireEnv } from './env.ts';
import type { SectionKey } from './content/schemas.ts';

/** Documento de una sección de la landing. `_id` ES la clave de sección. */
export type SectionDoc = {
  /**
   * La clave de sección se usa directamente como `_id`, en lugar de un
   * ObjectId con un índice único aparte sobre `key`. Así la unicidad queda
   * garantizada por construcción: MongoDB no permite dos docs con el mismo
   * `_id`, y se elimina un modo de fallo completo (claves duplicadas) además
   * de un índice que habría que mantener.
   */
  _id: SectionKey;
  data: unknown;
  updatedAt: Date;
  updatedBy: { userId: string; name: string; email: string } | null;
};

export type AppMetaDoc = {
  _id: string;
  [key: string]: unknown;
};

/**
 * Cache en globalThis: en Vercel las funciones serverless reutilizan el proceso
 * entre invocaciones (warm starts). Sin esta cache se abriría un pool nuevo por
 * request y Atlas rechazaría las conexiones por connection limit.
 */
const globalCache = globalThis as typeof globalThis & {
  __labMongo?: { client: MongoClient; db: Db };
};

/** ¿Hay credenciales? Permite que el repositorio caiga al seed sin intentar conectar. */
export function isMongoConfigured(): boolean {
  return Boolean(optionalEnv('MONGODB_URI') && optionalEnv('MONGODB_DB_NAME'));
}

/**
 * Conexión perezosa. NO se conecta al importar el módulo: si lanzara en el
 * import, el fallback a contenido semilla del repositorio nunca se ejecutaría.
 */
export async function getDb(): Promise<Db> {
  if (globalCache.__labMongo) return globalCache.__labMongo.db;

  const uri = requireEnv('MONGODB_URI');
  const dbName = requireEnv('MONGODB_DB_NAME');

  const client = new MongoClient(uri, {
    // Serverless: muchas instancias con pools pequeños, no lo contrario.
    maxPoolSize: 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
    appName: 'landing-laboratorio',
  });

  await client.connect();
  const db = client.db(dbName);
  globalCache.__labMongo = { client, db };
  return db;
}

export async function getSectionsCollection(): Promise<Collection<SectionDoc>> {
  return (await getDb()).collection<SectionDoc>('landing_sections');
}

export async function getMetaCollection(): Promise<Collection<AppMetaDoc>> {
  return (await getDb()).collection<AppMetaDoc>('app_meta');
}

/** Solo para scripts standalone: el proceso no termina si el socket sigue abierto. */
export async function closeMongo(): Promise<void> {
  if (globalCache.__labMongo) {
    await globalCache.__labMongo.client.close();
    globalCache.__labMongo = undefined;
  }
}
