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
import { setSection } from '../lib/content/repository.ts';
import { getDeployState, triggerDeploy } from '../lib/deploy.ts';

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

        const parsed = SECTION_SCHEMAS[key].safeParse(data);
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
