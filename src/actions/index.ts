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

        // TANDA 7 añadirá aquí el disparo del Deploy Hook de Vercel.
        // El guardado NO debe fallar si el webhook falla: el contenido ya está
        // en MongoDB y el redespliegue es reintentable.
        return { ok: true as const, savedAt: new Date().toISOString() };
      },
    }),
  },
};
