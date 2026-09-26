import { createAuthClient } from 'better-auth/client';

/**
 * Cliente de navegador. Sin `baseURL` a propósito: se resuelve contra el mismo
 * origen, así que el dominio no queda hardcodeado en el bundle y funciona igual
 * en local, en previews de Vercel y en producción.
 */
export const authClient = createAuthClient({ basePath: '/api/auth' });
