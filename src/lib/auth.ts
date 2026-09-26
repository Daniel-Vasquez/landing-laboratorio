import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { boolEnv, optionalEnv, requireEnv, requireUrlEnv } from './env.ts';
import { getClientSync, getDbSync } from './mongo.ts';

/**
 * Instancia de Better Auth (solo servidor).
 *
 * Alcance deliberadamente mínimo, por requerimiento: email + contraseña, sin
 * verificación de correo, sin 2FA y sin recuperación de contraseña. Validar
 * credenciales para entrar al dashboard es suficiente.
 *
 * El adaptador viene del core (`better-auth/adapters/mongodb`), que re-exporta
 * `@better-auth/mongo-adapter` — una dependencia directa de better-auth. Se
 * importa por el core para no fijar a mano una versión que better-auth ya pinea.
 */

const isProd = process.env.NODE_ENV === 'production';

/** Registro público: se cierra con ALLOW_PUBLIC_SIGNUP=false tras crear las cuentas. */
export const signupEnabled = boolEnv('ALLOW_PUBLIC_SIGNUP', false);

/** Si tiene valor, el formulario de registro exige este código. Validado en servidor. */
export const signupInviteCode = optionalEnv('SIGNUP_INVITE_CODE');

export const auth = betterAuth({
  // `client` habilita transacciones en el adaptador. Atlas (incluido M0) es un
  // replica set, así que las soporta. Con un mongod standalone habría que pasar
  // `transaction: false` o los escritos de sesión fallarían.
  database: mongodbAdapter(getDbSync(), { client: getClientSync() }),

  secret: requireEnv('BETTER_AUTH_SECRET'),
  // requireUrlEnv normaliza comillas, protocolo y slash final: un valor con
  // comillas aquí NO rompería el build, rompería las cookies de sesión en
  // producción, que es un fallo mucho más difícil de diagnosticar.
  baseURL: requireUrlEnv('BETTER_AUTH_URL'),
  basePath: '/api/auth',

  // Sin esto, Better Auth rechaza las peticiones del propio dominio en producción.
  // Debe coincidir EXACTAMENTE con el origen servido, sin slash final.
  trustedOrigins: [requireUrlEnv('PUBLIC_SITE_URL')],

  emailAndPassword: {
    enabled: true,
    // Requerimiento explícito: sin verificación de correo ni 2FA.
    requireEmailVerification: false,
    // 10 caracteres sin exigir símbolos: imponer clases de caracteres empuja a
    // patrones predecibles y baja la entropía real.
    minPasswordLength: 10,
    maxPasswordLength: 128,
    // Tras registrarse se entra directo, sin un login extra.
    autoSignIn: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24, // refresca la sesión si ya pasó 1 día
    // Sin cookieCache, CADA request a /admin hace un findOne en `session`.
    // Con él, la sesión se valida desde una cookie firmada durante 5 minutos.
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  advanced: {
    cookiePrefix: 'lab',
    useSecureCookies: isProd,
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    // 'database' es obligatorio en serverless: la memoria no se comparte entre
    // instancias, así que un límite en memoria no limita nada.
    storage: 'database',
  },
});

export type SessionUser = { id: string; name: string; email: string };
