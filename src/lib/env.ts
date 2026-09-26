/**
 * Acceso a variables de entorno del lado servidor.
 *
 * Se usa `process.env` deliberadamente, NUNCA `import.meta.env`, porque el
 * código de src/lib corre en tres contextos distintos:
 *
 *   1. `astro build` (SSG): astro.config.mjs llama `process.loadEnvFile('.env')`
 *      al cargarse, así que el proceso del build ya tiene las vars de .env.
 *   2. Scripts Node standalone (scripts/*.ts): cargan .env por su cuenta.
 *   3. Vercel (build y runtime SSR): las env vars del proyecto SON process.env.
 *
 * `import.meta.env` es `undefined` en Node plano (verificado), así que el
 * patrón `import.meta.env.X ?? process.env.X` lanzaría TypeError en el caso 2.
 * Además, Vite solo reescribe accesos estáticos, no dinámicos.
 *
 * Ninguna de estas variables lleva prefijo PUBLIC_, así que jamás llegan al
 * bundle del navegador.
 */

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[env] La variable ${key} no está definida. Revisa tu .env (plantilla en .env.example) ` +
        `o las Environment Variables del proyecto en Vercel.`,
    );
  }
  return value;
}

export function optionalEnv(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

/** Solo la cadena exacta "true" activa. Cualquier otro valor desactiva. */
export function boolEnv(key: string, fallback = false): boolean {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

export function intEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}
