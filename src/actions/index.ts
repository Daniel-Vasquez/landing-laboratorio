import { ActionError, defineAction } from 'astro:actions';
// `astro:schema` está deprecado y se elimina en Astro 8: el reemplazo es
// `astro/zod`, que es el zod que Astro usa internamente para validar el input.
import { z } from 'astro/zod';
import {
  SECTION_KEYS,
  SECTION_SCHEMAS,
  isSectionKey,
  type SectionKey,
} from '../lib/content/schemas.ts';
import { getSection, setSection } from '../lib/content/repository.ts';
import { getDeployState, triggerDeploy } from '../lib/deploy.ts';
import { getSlot, isSlotId } from '../lib/images/slots.ts';
import {
  sectionConfigItemSchema,
  setSectionLayout,
} from '../lib/sections/repository.ts';
import { leadFormConfigSchema } from '../lib/leads/schemas.ts';
import { setLeadFormConfig } from '../lib/leads/repository.ts';
import {
  CARD_IMAGE_GROUPS,
  cardGroupFor,
  cardPublicId,
  cardSlot,
  newImageKey,
} from '../lib/images/cards.ts';
import type { ImageSlot } from '../lib/images/slots.ts';
import { getImagesCollection } from '../lib/mongo.ts';
import { setSlotImage } from '../lib/images/repository.ts';
import { MAX_BYTES, sniffImageType, uploadToSlot } from '../lib/images/cloudinary.ts';

/**
 * Server actions del dashboard.
 *
 * DEFENSA EN PROFUNDIDAD: cada action revalida la sesión por su cuenta.
 * `src/middleware.ts` protege la NAVEGACIÓN, pero las actions son endpoints
 * POST alcanzables directamente con curl; confiar solo en el middleware dejaría
 * la escritura de contenido abierta a cualquiera.
 */
function requireUser(locals: App.Locals) {
  if (!locals.user) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
      message: 'Tu sesión expiró. Vuelve a entrar para guardar.',
    });
  }
  return locals.user;
}

/**
 * Asigna `imageKey` a las tarjetas que no lo tengan y conserva los existentes.
 * Devuelve el dato intacto si la sección no tiene grupo de imágenes de tarjeta.
 */
async function ensureImageKeys(key: SectionKey, data: unknown): Promise<unknown> {
  const group = cardGroupFor(key);
  if (!group || typeof data !== 'object' || data === null) return data;

  const record = data as Record<string, unknown>;
  const items = record[group.path];
  if (!Array.isArray(items)) return data;

  /**
   * Claves legítimas, de dos procedencias:
   *
   *  1. las que ya están guardadas en el documento (edición normal);
   *  2. las que tienen una fila en `landing_images`, es decir: una imagen que
   *     se acaba de subir para una tarjeta que aún no se ha guardado.
   *
   * Sin la segunda, el formulario unificado perdería la imagen de cada tarjeta
   * nueva: al guardar, el servidor descartaría su clave por desconocida y
   * generaría otra, dejando la imagen recién subida huérfana.
   */
  const stored = await getSection(key);
  const storedItems = (stored as Record<string, unknown>)[group.path];
  const known = new Set(
    Array.isArray(storedItems)
      ? storedItems
          .map((item) => (item as { imageKey?: unknown })?.imageKey)
          .filter((k): k is string => typeof k === 'string')
      : [],
  );

  const prefix = `${group.path}:`;
  const uploaded = await (await getImagesCollection())
    .find({ _id: { $regex: `^${prefix}` } }, { projection: { _id: 1 } })
    .toArray();
  for (const row of uploaded) known.add(row._id.slice(prefix.length));

  const used = new Set<string>();
  const next = items.map((item) => {
    const candidate = (item as { imageKey?: unknown })?.imageKey;
    const valid =
      typeof candidate === 'string' && known.has(candidate) && !used.has(candidate);
    const imageKey = valid ? (candidate as string) : newImageKey();
    used.add(imageKey);
    return { ...(item as object), imageKey };
  });

  return { ...record, [group.path]: next };
}

/**
 * Resuelve `<path>:<imageKey>` comprobando que la tarjeta exista de verdad.
 *
 * Reutiliza el `publicId` de la fila ya guardada si la hay: los seis estudios
 * originales tienen assets con nombres en español (`Perfil_Tiroideo`), y
 * regenerar el id los dejaría huérfanos en Cloudinary.
 */
async function resolveCardSlot(slotId: string): Promise<ImageSlot | null> {
  const separator = slotId.indexOf(':');
  if (separator < 0) return null;

  const path = slotId.slice(0, separator);
  const imageKey = slotId.slice(separator + 1);
  const group = CARD_IMAGE_GROUPS.find((g) => g.path === path);
  if (!group || imageKey.length === 0) return null;

  const section = await getSection(group.section);
  const items = (section as Record<string, unknown>)[group.path];
  if (!Array.isArray(items)) return null;

  const item = items.find(
    (candidate) => (candidate as { imageKey?: unknown })?.imageKey === imageKey,
  ) as Record<string, unknown> | undefined;

  /**
   * Se acepta la clave en DOS casos:
   *
   *  a) la tarjeta ya existe en el documento (edición normal);
   *  b) la clave NO la usa ninguna tarjeta todavía (tarjeta recién creada en el
   *     formulario, cuya imagen se sube ANTES de guardar el texto).
   *
   * Lo que se sigue impidiendo es el caso peligroso: apropiarse de la clave de
   * OTRA tarjeta para sobrescribir su imagen. Si la clave está en uso, tiene
   * que ser la del propio item.
   */
  if (!item) {
    const enUso = items.some(
      (candidate) => (candidate as { imageKey?: unknown })?.imageKey === imageKey,
    );
    if (enUso) return null;
  }

  const existing = await (await getImagesCollection()).findOne({ _id: slotId });
  const title = item ? String(item[group.titleField] ?? 'Tarjeta') : 'Tarjeta nueva';

  return cardSlot(group, imageKey, title, existing?.publicId ?? cardPublicId(group, imageKey));
}

export const server = {
  content: {
    updateSection: defineAction({
      accept: 'json',
      input: z.object({
        key: z.enum(SECTION_KEYS as [SectionKey, ...SectionKey[]]),
        // `data` llega como unknown a propósito: su forma depende de `key`, así
        // que la valida el esquema concreto de la sección más abajo. Un
        // discriminated union de 11 ramas aquí solo duplicaría SECTION_SCHEMAS.
        data: z.unknown(),
      }),
      handler: async ({ key, data }, context) => {
        const user = requireUser(context.locals);

        if (!isSectionKey(key)) {
          throw new ActionError({ code: 'BAD_REQUEST', message: `Sección desconocida: ${key}` });
        }

        /**
         * Los `imageKey` los gobierna el SERVIDOR, no el cliente.
         *
         * El panel recibe el documento completo y lo devuelve entero al
         * guardar, así que un cliente manipulado podría inventar claves y
         * apropiarse de la imagen de otra tarjeta. Aquí solo se aceptan claves
         * que YA existen en el documento almacenado; cualquier otra se
         * descarta y se genera una nueva.
         */
        const withKeys = await ensureImageKeys(key as SectionKey, data);

        const parsed = SECTION_SCHEMAS[key].safeParse(withKeys);
        if (!parsed.success) {
          // Se devuelven los errores por campo para que el formulario pueda
          // señalarlos, no solo un mensaje global.
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: parsed.error.issues
              .map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
              .join(' · '),
          });
        }

        try {
          await setSection(key, parsed.data as never, {
            userId: user.id,
            name: user.name,
            email: user.email,
          });
        } catch (error) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `No se pudo guardar en la base de datos: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }

        // El contenido ya está a salvo en MongoDB. `triggerDeploy` captura sus
        // propios errores y los devuelve en el resultado en lugar de lanzar:
        // un webhook caído NO debe convertir un guardado exitoso en un error.
        // El redespliegue es reintentable desde el botón "Publicar ahora".
        const deploy = await triggerDeploy({
          reason: `content:${key}`,
          actor: { name: user.name },
        });

        return { ok: true as const, savedAt: new Date().toISOString(), deploy };
      },
    }),
  },

  images: {
    /**
     * REEMPLAZA la imagen de una ranura existente. No existe una action para
     * crear ranuras: el registro vive en código, así que un `slotId` que no
     * esté ahí se rechaza aquí mismo.
     */
    replace: defineAction({
      // 'form', no 'json': recibe un File dentro de FormData.
      accept: 'form',
      input: z.object({
        slotId: z.string(),
        // `.nullish()`: un campo de texto vacío en un envío multipart llega
        // como `null`, y uno ausente como `undefined`. Sin aceptar ambos, el
        // fallo sería un error de esquema sin mensaje útil en lugar del aviso
        // propio de más abajo.
        alt: z.string().max(300).nullish(),
        file: z.instanceof(File),
      }),
      handler: async ({ slotId, alt, file }, context) => {
        const user = requireUser(context.locals);

        /**
         * Dos tipos de ranura, ambas verificadas contra el servidor:
         *
         *  - FIJA: tiene que estar en el registro de `slots.ts`. Su número no
         *    cambia nunca.
         *  - DE TARJETA: `<path>:<imageKey>`. Se acepta solo si ese `imageKey`
         *    existe realmente en el documento de la sección. Así, inventar una
         *    clave no crea una ranura: primero hay que crear la tarjeta.
         */
        const slot = isSlotId(slotId)
          ? getSlot(slotId)!
          : await resolveCardSlot(slotId);

        if (!slot) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message:
              `Ranura desconocida: ${slotId}. Las ranuras fijas se definen en código, ` +
              'y las de tarjeta solo existen si la tarjeta existe.',
          });
        }

        if (file.size === 0) {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'El archivo está vacío.' });
        }
        if (file.size > MAX_BYTES) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo son ${MAX_BYTES / 1024 / 1024} MB.`,
          });
        }

        const bytes = new Uint8Array(await file.arrayBuffer());

        // Validación por CONTENIDO. La extensión y el Content-Type los controla
        // el cliente: un SVG con <script> renombrado a .png pasaría cualquier
        // comprobación basada en el nombre.
        const detected = sniffImageType(bytes);
        if (!detected) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'El archivo no es una imagen PNG, JPG o WebP válida.',
          });
        }

        // Una ranura decorativa (fondo) lleva alt vacío a propósito.
        const requiresAlt = slot.altDefault !== null;
        const cleanAlt = (alt ?? '').trim();
        if (requiresAlt && cleanAlt.length < 5) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Describe la imagen en el texto alternativo (mínimo 5 caracteres).',
          });
        }

        let uploaded;
        try {
          uploaded = await uploadToSlot(slot.publicId, bytes, file.name);
        } catch (error) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `No se pudo subir la imagen: ${error instanceof Error ? error.message : String(error)}`,
          });
        }

        await setSlotImage(slot, uploaded, requiresAlt ? cleanAlt : '', {
          userId: user.id,
          name: user.name,
          email: user.email,
        });

        const deploy = await triggerDeploy({
          reason: `image:${slot.id}`,
          actor: { name: user.name },
        });

        return { ok: true as const, savedAt: new Date().toISOString(), deploy };
      },
    }),
  },

  leadForm: {
    /**
     * Guarda contactos, textos y preguntas del formulario.
     *
     * El servidor normaliza: descarta preguntas fuera del registro y repone las
     * opciones de las no editables. No existe action para crear ni eliminar
     * preguntas — el conjunto vive en `leads/questions.ts`.
     */
    updateConfig: defineAction({
      accept: 'json',
      input: leadFormConfigSchema,
      handler: async (config, context) => {
        const user = requireUser(context.locals);

        try {
          await setLeadFormConfig(config, {
            userId: user.id,
            name: user.name,
            email: user.email,
          });
        } catch (error) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `No se pudo guardar la configuración: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }

        const deploy = await triggerDeploy({
          reason: 'lead-form:config',
          actor: { name: user.name },
        });

        return { ok: true as const, savedAt: new Date().toISOString(), deploy };
      },
    }),
  },

  sections: {
    /**
     * Guarda orden, visibilidad y títulos del menú.
     *
     * El servidor NORMALIZA: descarta claves fuera del registro, fuerza
     * `isVisible: true` en las secciones fijas y recalcula `orden` desde el
     * índice del array. Así, un POST directo que intente ocultar el hero o
     * mover el CTA final no puede dejar la landing sin <h1> ni con ocho
     * enlaces muertos.
     */
    updateLayout: defineAction({
      accept: 'json',
      input: z.object({
        items: z.array(sectionConfigItemSchema).min(1).max(20),
      }),
      handler: async ({ items }, context) => {
        const user = requireUser(context.locals);

        try {
          await setSectionLayout(items, {
            userId: user.id,
            name: user.name,
            email: user.email,
          });
        } catch (error) {
          throw new ActionError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `No se pudo guardar el orden: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }

        const deploy = await triggerDeploy({
          reason: 'sections:layout',
          actor: { name: user.name },
        });

        return { ok: true as const, savedAt: new Date().toISOString(), deploy };
      },
    }),
  },

  deploy: {
    /** Estado para el indicador del dashboard. Solo lectura. */
    state: defineAction({
      handler: async (_input, context) => {
        requireUser(context.locals);
        return getDeployState();
      },
    }),

    /**
     * Disparo manual. `force: true` salta la ventana de enfriamiento: lo pide
     * una persona explícitamente, así que la protección contra ráfagas
     * automáticas no aplica.
     */
    trigger: defineAction({
      handler: async (_input, context) => {
        const user = requireUser(context.locals);
        return triggerDeploy({ reason: 'manual', actor: { name: user.name }, force: true });
      },
    }),

    /**
     * Drena un cambio pendiente si ya pasó el enfriamiento. SIN `force`: si
     * todavía no toca, no dispara. Lo llama el indicador del dashboard cuando
     * detecta `pending`, y el cron opcional.
     */
    drain: defineAction({
      handler: async (_input, context) => {
        const user = requireUser(context.locals);
        const state = await getDeployState();
        if (!state.pending) {
          return { ok: true as const, triggered: false as const, reason: 'nothing-pending' as const };
        }
        return triggerDeploy({ reason: 'drain-pending', actor: { name: user.name } });
      },
    }),
  },
};
