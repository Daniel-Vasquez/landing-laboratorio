import { z } from 'zod';
import { getDb, isMongoConfigured } from '../mongo.ts';
import { recordChange } from '../audit.ts';
import {
  RENDERABLE_KEYS,
  SECTION_REGISTRY,
  getDefinition,
  isRenderableKey,
  type RenderableKey,
  type SectionDefinition,
} from './registry.ts';

const CONFIG_ID = 'sections';

export const sectionConfigItemSchema = z.object({
  id_seccion: z.enum(RENDERABLE_KEYS as [string, ...string[]]),
  titulo_menu: z.string().trim().min(1).max(40),
  orden: z.number().int().min(0),
  isVisible: z.boolean(),
});

export type SectionConfigItem = z.infer<typeof sectionConfigItemSchema>;

export type ResolvedSection = Omit<SectionDefinition, 'key'> & {
  key: RenderableKey;
  menuTitle: string;
  visible: boolean;
};

export type Editor = { userId: string; name: string; email: string };

async function getConfigCollection() {
  return (await getDb()).collection<{ _id: string; items: SectionConfigItem[] }>('landing_config');
}

/** Orden por defecto: el del registro, todo visible. */
function defaultLayout(): ResolvedSection[] {
  return SECTION_REGISTRY.map((definition) => ({
    ...definition,
    key: definition.key as RenderableKey,
    menuTitle: definition.defaultMenuTitle,
    visible: true,
  }));
}

/**
 * Secciones en el orden en que deben renderizarse.
 *
 * SIEMPRE se reconcilia contra el registro de código, que es la autoridad sobre
 * qué existe:
 *   - una clave guardada que ya no está en el registro se descarta;
 *   - una sección del registro ausente del documento se añade al final, visible.
 *     Así, desplegar una sección nueva no exige tocar la base ni deja la landing
 *     sin ella;
 *   - `movable: false` fuerza visibilidad y posición del registro.
 *
 * Si el documento no existe o no valida, se usa el orden por defecto. Misma
 * política tolerante que el contenido: el build nunca cae por datos.
 */
export async function getSectionLayout(): Promise<ResolvedSection[]> {
  if (!isMongoConfigured()) return defaultLayout();

  let stored: SectionConfigItem[] = [];
  try {
    const doc = await (await getConfigCollection()).findOne({ _id: CONFIG_ID });
    const parsed = z.array(sectionConfigItemSchema).safeParse(doc?.items ?? []);
    if (!parsed.success) {
      console.warn('[sections] La configuración no validó; se usa el orden por defecto.');
      return defaultLayout();
    }
    stored = parsed.data;
  } catch (error) {
    console.warn(
      `[sections] No se pudo leer la configuración, se usa el orden por defecto. ` +
        `Causa: ${error instanceof Error ? error.message : String(error)}`,
    );
    return defaultLayout();
  }

  const byKey = new Map(stored.map((item) => [item.id_seccion, item]));

  // Las guardadas, en su orden, descartando las que ya no existen en código.
  const ordered: ResolvedSection[] = stored
    .filter((item) => isRenderableKey(item.id_seccion))
    .map((item) => {
      const definition = getDefinition(item.id_seccion)!;
      return {
        ...definition,
        key: definition.key as RenderableKey,
        menuTitle: item.titulo_menu || definition.defaultMenuTitle,
        // Una sección fija nunca puede quedar oculta, venga como venga el dato.
        visible: definition.movable ? item.isVisible : true,
      };
    });

  // Las del registro que falten, al final y visibles.
  for (const definition of SECTION_REGISTRY) {
    if (byKey.has(definition.key)) continue;
    ordered.push({
      ...definition,
      key: definition.key as RenderableKey,
      menuTitle: definition.defaultMenuTitle,
      visible: true,
    });
  }

  return pinFixedSections(ordered);
}

/**
 * Devuelve las secciones fijas a su posición del registro.
 *
 * La regla: cada sección fija ocupa su índice del registro, y los huecos que
 * dejan las movibles se rellenan en el orden que guardó el administrador.
 *
 * El servidor ya normaliza al guardar, pero un documento escrito antes de esta
 * regla —o editado a mano en Atlas— podría traer el hero en medio. Reponerlas
 * al LEER hace que la landing sea correcta incluso con datos viejos.
 */
function pinFixedSections(sections: ResolvedSection[]): ResolvedSection[] {
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const movableQueue = sections.filter((section) => section.movable);
  let next = 0;

  return SECTION_REGISTRY.map((definition) =>
    definition.movable ? movableQueue[next++] : byKey.get(definition.key as RenderableKey),
  ).filter((section): section is ResolvedSection => Boolean(section));
}

/**
 * Guarda el orden. Normaliza en el SERVIDOR, no confía en el cliente:
 *   1. descarta claves fuera del registro;
 *   2. fuerza `isVisible: true` en las secciones fijas;
 *   3. recalcula `orden` desde el índice del array.
 *
 * El punto 3 es lo que impide que `orden` se desincronice: guardar la posición
 * ADEMÁS del orden del array daría dos fuentes de verdad, y un guardado parcial
 * podría dejar dos secciones con el mismo número.
 */
export async function setSectionLayout(
  items: SectionConfigItem[],
  editor: Editor,
): Promise<void> {
  const seen = new Set<string>();
  const normalized: SectionConfigItem[] = [];

  for (const item of items) {
    const definition = getDefinition(item.id_seccion);
    if (!definition || seen.has(item.id_seccion)) continue;
    seen.add(item.id_seccion);
    normalized.push({
      id_seccion: item.id_seccion,
      titulo_menu: item.titulo_menu.trim() || definition.defaultMenuTitle,
      orden: normalized.length,
      isVisible: definition.movable ? item.isVisible : true,
    });
  }

  // Completar con lo que falte, para que el documento describa el registro entero.
  for (const definition of SECTION_REGISTRY) {
    if (seen.has(definition.key)) continue;
    normalized.push({
      id_seccion: definition.key as RenderableKey,
      titulo_menu: definition.defaultMenuTitle,
      orden: normalized.length,
      isVisible: true,
    });
  }

  const now = new Date();
  await (await getConfigCollection()).updateOne(
    { _id: CONFIG_ID },
    { $set: { items: normalized, updatedAt: now, updatedBy: editor } },
    { upsert: true },
  );

  await recordChange({ ...editor, sectionKey: 'hero', at: now });
}

/** Estado para el editor del panel: incluye las ocultas y las fijas. */
export async function getSectionLayoutForAdmin(): Promise<
  Array<SectionConfigItem & { movable: boolean; inMenu: boolean }>
> {
  const layout = await getSectionLayout();
  return layout.map((section, index) => ({
    id_seccion: section.key,
    titulo_menu: section.menuTitle,
    orden: index,
    isVisible: section.visible,
    movable: section.movable,
    inMenu: section.inMenu,
  }));
}
