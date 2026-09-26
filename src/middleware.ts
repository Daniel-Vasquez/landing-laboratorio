import { defineMiddleware } from 'astro:middleware';
import { auth } from './lib/auth.ts';

/**
 * Protege /admin y expone la sesión en `Astro.locals`.
 *
 * IMPORTANTE — defensa en profundidad: este middleware protege la NAVEGACIÓN,
 * no es suficiente por sí solo. Las server actions de la Tanda 6 son endpoints
 * POST alcanzables directamente, así que cada una revalida la sesión por su
 * cuenta. Nunca tratar este archivo como el único control de acceso.
 *
 * Corre en runtime Node (`middlewareMode: 'classic'` en astro.config.mjs):
 * Better Auth y el driver mongodb no funcionan en el runtime Edge.
 */

const PROTECTED = /^\/admin(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  /**
   * Las rutas prerenderizadas (la landing) se renderizan en BUILD TIME, donde
   * no existe una petición real: leer `context.request.headers` ahí emite un
   * warning de Astro y no puede devolver ninguna sesión. Además sería trabajo
   * inútil: la landing es pública y no consulta `locals.user`.
   */
  if (context.isPrerendered) return next();

  // El handler de Better Auth gestiona su propia sesión; consultarla aquí
  // añadiría una query por cada request de login sin ningún beneficio.
  if (pathname.startsWith('/api/auth')) return next();

  /**
   * FALLAR CERRADO. Si MongoDB no responde, `getSession` lanza y la ruta
   * devolvería un 500 (que además puede filtrar traza en dev). Un fallo de base
   * de datos se trata como "sin sesión": el usuario acaba en /login, que es
   * degradación correcta y nunca concede acceso por error.
   */
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: context.request.headers });
  } catch (error) {
    console.error(
      `[auth] No se pudo validar la sesión para ${pathname}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  context.locals.user = session?.user
    ? { id: session.user.id, name: session.user.name, email: session.user.email }
    : null;
  context.locals.session = session?.session
    ? { id: session.session.id, expiresAt: session.session.expiresAt }
    : null;

  if (PROTECTED.test(pathname) && !session) {
    // Se preserva el destino para devolver al usuario ahí después del login.
    const redirectTo = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`/login?redirect=${redirectTo}`, 302);
  }

  return next();
});
