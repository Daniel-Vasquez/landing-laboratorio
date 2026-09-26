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

/**
 * Normaliza y valida una variable que debe contener un URL absoluto.
 *
 * Existe porque los tres fallos más comunes al cargar estas variables en un
 * panel de hosting producen errores pésimos:
 *   - `"https://sitio.com"` con comillas (se copian junto al valor desde .env)
 *     -> `new URL()` lanza "Invalid URL" sin decir cuál ni por qué.
 *   - `sitio.com` sin protocolo -> mismo error opaco.
 *   - espacios o saltos de línea al final -> a veces pasa, a veces no.
 * Las comillas y los espacios nunca son intencionados, y un host desnudo es
 * inequívoco, así que se corrigen avisando en el log en lugar de tumbar el
 * deploy. Cualquier otro valor inválido sí falla, con el valor recibido a la
 * vista.
 */
export function normalizeUrlEnv(key: string, raw: string | undefined): string {
  if (!raw) {
    throw new Error(
      `[env] ${key} no está definida. Cárgala en Vercel -> Settings -> Environment Variables.`,
    );
  }

  let value = raw.trim();

  const unquoted = value.replace(/^["']|["']$/g, '');
  if (unquoted !== value) {
    console.warn(
      `[env] ${key} traía comillas en el valor y se han quitado. ` +
        `En Vercel el valor se escribe sin comillas.`,
    );
    value = unquoted.trim();
  }

  if (!/^https?:\/\//.test(value)) {
    console.warn(`[env] ${key} no incluía protocolo; se asume https://`);
    value = `https://${value}`;
  }

  // Sin slash final: BETTER_AUTH_URL y PUBLIC_SITE_URL deben coincidir
  // EXACTAMENTE con el origen servido o las cookies de sesión se rechazan.
  value = value.replace(/\/+$/, '');

  try {
    new URL(value);
  } catch {
    throw new Error(
      `[env] ${key} no es un URL válido. Valor recibido: ${JSON.stringify(raw)}. ` +
        `Se espera algo como https://laboratorio.tudominio.com (sin comillas y sin slash final).`,
    );
  }

  return value;
}

/** Variable de entorno obligatoria que debe ser un URL absoluto. */
export function requireUrlEnv(key: string): string {
  return normalizeUrlEnv(key, process.env[key]);
}
