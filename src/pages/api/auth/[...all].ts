import type { APIRoute } from 'astro';
import { auth, signupEnabled, signupInviteCode } from '../../../lib/auth.ts';

export const prerender = false;

/**
 * Handler de Better Auth para todas sus rutas bajo /api/auth/*.
 *
 * Antes de delegar se aplica la compuerta de registro. `emailAndPassword` NO
 * tiene opción `disableSignUp` (solo los proveedores OAuth la tienen), así que
 * el bloqueo se hace aquí, en el borde.
 *
 * Esto es la defensa real: ocultar el enlace a /registro o devolver 404 en la
 * página no impide un POST directo a este endpoint con curl.
 */
function isSignUpRequest(request: Request): boolean {
  return (
    request.method === 'POST' &&
    new URL(request.url).pathname.startsWith('/api/auth/sign-up')
  );
}

async function rejectSignUp(request: Request): Promise<Response | null> {
  if (!isSignUpRequest(request)) return null;

  if (!signupEnabled) {
    return Response.json(
      { message: 'El registro de nuevas cuentas está cerrado.' },
      { status: 403 },
    );
  }

  if (signupInviteCode) {
    // El cuerpo solo se puede leer una vez, así que se clona para no consumir
    // el stream que Better Auth necesita después.
    let submitted: unknown;
    try {
      const body = (await request.clone().json()) as { inviteCode?: unknown };
      submitted = body?.inviteCode;
    } catch {
      submitted = undefined;
    }

    if (submitted !== signupInviteCode) {
      return Response.json({ message: 'Código de invitación inválido.' }, { status: 403 });
    }
  }

  return null;
}

export const ALL: APIRoute = async ({ request }) => {
  const blocked = await rejectSignUp(request);
  if (blocked) return blocked;

  return auth.handler(request);
};
