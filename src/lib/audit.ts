import { getMetaCollection } from './mongo.ts';
import type { SectionKey } from './content/schemas.ts';

/**
 * Registro del último cambio en el contenido.
 *
 * Alcance deliberadamente mínimo, por requerimiento: se guarda QUIÉN hizo el
 * último cambio, no un historial de qué modificó. Es un único documento que se
 * sobrescribe, no una colección que crece.
 *
 * Se invoca desde `repository.setSection()`, NO desde las actions. Así cualquier
 * ruta de escritura futura (un script, un import masivo, otra action) queda
 * auditada por construcción y no por acordarse de llamarla.
 */

const LAST_CHANGE_ID = 'last_change';

export type LastChange = {
  userId: string;
  name: string;
  email: string;
  sectionKey: SectionKey;
  at: Date;
};

export async function recordChange(input: {
  userId: string;
  name: string;
  email: string;
  sectionKey: SectionKey;
  at?: Date;
}): Promise<void> {
  const meta = await getMetaCollection();
  await meta.updateOne(
    { _id: LAST_CHANGE_ID },
    {
      $set: {
        userId: input.userId,
        name: input.name,
        email: input.email,
        sectionKey: input.sectionKey,
        at: input.at ?? new Date(),
      },
    },
    { upsert: true },
  );
}

export async function getLastChange(): Promise<LastChange | null> {
  const meta = await getMetaCollection();
  const doc = await meta.findOne({ _id: LAST_CHANGE_ID });
  if (!doc || typeof doc.name !== 'string' || !(doc.at instanceof Date)) return null;

  return {
    userId: String(doc.userId ?? ''),
    name: doc.name,
    email: String(doc.email ?? ''),
    sectionKey: doc.sectionKey as SectionKey,
    at: doc.at,
  };
}
