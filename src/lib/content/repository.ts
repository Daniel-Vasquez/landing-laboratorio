import { boolEnv } from '../env.ts';
import {
  getMetaCollection,
  getSectionsCollection,
  isMongoConfigured,
  type SectionDoc,
} from '../mongo.ts';
import { SEED } from './seed.ts';
import {
  SECTION_KEYS,
  SECTION_LABELS,
  SECTION_SCHEMAS,
  type LandingContent,
  type SectionKey,
} from './schemas.ts';

export type Editor = { userId: string; name: string; email: string };

/**
 * Única puerta de acceso al contenido. Ningún componente debe importar
 * `mongo.ts` directamente.
 *
 * Política de tolerancia a fallos (requisito: el build NUNCA debe romperse por
 * datos, pero SÍ debe dejar rastro en los logs de Vercel):
 *   - sección ausente en la base  -> se usa SEED[key]
 *   - sección que no valida       -> se usa SEED[key] + warning
 *   - Atlas caído o sin credenciales, con CONTENT_FALLBACK_TO_SEED=true
 *                                 -> se usa SEED completo + warning
 *   - Atlas caído con la bandera en false -> se lanza el error (build falla)
 */

function warn(message: string): void {
  console.warn(`[content] ${message}`);
}

function parseSection<K extends SectionKey>(key: K, raw: unknown): LandingContent[K] {
  const result = SECTION_SCHEMAS[key].safeParse(raw);
  if (result.success) return result.data as LandingContent[K];

  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
    .join(' · ');
  warn(`La sección "${key}" no pasó validación y se usó el contenido semilla. ${detail}`);
  return SEED[key];
}

/** Devuelve las 11 secciones con UNA sola query, no once. */
export async function getLandingContent(): Promise<LandingContent> {
  if (!isMongoConfigured()) {
    if (boolEnv('CONTENT_FALLBACK_TO_SEED', true)) {
      warn('MongoDB no está configurado. Se renderiza el contenido semilla.');
      return SEED;
    }
    throw new Error(
      '[content] MongoDB no está configurado y CONTENT_FALLBACK_TO_SEED no está en "true".',
    );
  }

  let docs: SectionDoc[];
  try {
    const collection = await getSectionsCollection();
    docs = await collection.find({}).toArray();
  } catch (error) {
    if (boolEnv('CONTENT_FALLBACK_TO_SEED', true)) {
      warn(
        `No se pudo leer MongoDB, se renderiza el contenido semilla. ` +
          `Causa: ${error instanceof Error ? error.message : String(error)}`,
      );
      return SEED;
    }
    throw error;
  }

  const byKey = new Map(docs.map((doc) => [doc._id, doc.data]));

  const content = {} as LandingContent;
  for (const key of SECTION_KEYS) {
    if (!byKey.has(key)) {
      warn(`La sección "${key}" no existe en MongoDB y se usó el contenido semilla.`);
      content[key] = SEED[key] as never;
      continue;
    }
    content[key] = parseSection(key, byKey.get(key)) as never;
  }
  return content;
}

export async function getSection<K extends SectionKey>(key: K): Promise<LandingContent[K]> {
  if (!isMongoConfigured()) return SEED[key];
  try {
    const collection = await getSectionsCollection();
    const doc = await collection.findOne({ _id: key });
    if (!doc) return SEED[key];
    return parseSection(key, doc.data);
  } catch (error) {
    warn(
      `No se pudo leer la sección "${key}": ${error instanceof Error ? error.message : String(error)}`,
    );
    return SEED[key];
  }
}

/**
 * Escribe una sección y registra al autor del último cambio.
 *
 * Son dos colecciones y MongoDB no las hace atómicas sin transacción. Es
 * aceptable: si la auditoría falla, el contenido ya quedó guardado y solo el
 * registro de "último autor" queda viejo. NO se introduce una transacción por
 * esto (exige replica set y añade latencia por cada guardado).
 * El orden importa: primero el contenido, después la auditoría.
 */
export async function setSection<K extends SectionKey>(
  key: K,
  data: LandingContent[K],
  editor: Editor,
): Promise<void> {
  const collection = await getSectionsCollection();
  const now = new Date();

  await collection.updateOne(
    { _id: key },
    { $set: { data, updatedAt: now, updatedBy: editor } },
    { upsert: true },
  );

  const meta = await getMetaCollection();
  await meta.updateOne(
    { _id: 'last_change' },
    { $set: { ...editor, sectionKey: key, at: now } },
    { upsert: true },
  );
}

export type SectionMeta = {
  key: SectionKey;
  label: string;
  updatedAt: Date | null;
  updatedBy: Editor | null;
};

/**
 * Listado para el índice del dashboard.
 *
 * A diferencia de la landing, aquí NO se cae al contenido semilla en silencio:
 * un editor tiene que saber si la base no responde, porque si guarda creyendo
 * que todo va bien perdería el cambio. Por eso el resultado distingue el fallo
 * explícitamente, y la página muestra un aviso pero sigue renderizando la lista
 * de secciones (con metadata vacía) en lugar de devolver un 500.
 */
export type SectionsMetaResult = {
  ok: boolean;
  error: string | null;
  sections: SectionMeta[];
};

function emptyMeta(): SectionMeta[] {
  return SECTION_KEYS.map((key) => ({
    key,
    label: SECTION_LABELS[key],
    updatedAt: null,
    updatedBy: null,
  }));
}

export async function listSectionsMeta(): Promise<SectionsMetaResult> {
  if (!isMongoConfigured()) {
    return {
      ok: false,
      error: 'MongoDB no está configurado (falta MONGODB_URI o MONGODB_DB_NAME).',
      sections: emptyMeta(),
    };
  }

  try {
    const collection = await getSectionsCollection();
    const docs = await collection
      .find({}, { projection: { updatedAt: 1, updatedBy: 1 } })
      .toArray();
    const byKey = new Map(docs.map((doc) => [doc._id, doc]));

    return {
      ok: true,
      error: null,
      sections: SECTION_KEYS.map((key) => {
        const doc = byKey.get(key);
        return {
          key,
          label: SECTION_LABELS[key],
          updatedAt: doc?.updatedAt ?? null,
          updatedBy: doc?.updatedBy ?? null,
        };
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      sections: emptyMeta(),
    };
  }
}
