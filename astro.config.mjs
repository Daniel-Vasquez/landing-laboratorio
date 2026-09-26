import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

/**
 * `astro.config.mjs` corre en Node ANTES de que Vite cargue los archivos .env,
 * así que `process.env` aquí solo contiene variables reales de la shell.
 * En Vercel eso basta (las env vars del proyecto sí son process.env), pero en
 * local dejaría `site` en un valor por defecto sin avisar.
 * `loadEnvFile` cierra esa brecha para que el build local sea idéntico al de CI.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // En Vercel no existe .env: las variables ya vienen inyectadas.
}

/**
 * Normalización de PUBLIC_SITE_URL.
 *
 * Duplica a propósito la lógica de `src/lib/env.ts#normalizeUrlEnv`: este
 * archivo se carga antes de que exista cualquier pipeline de módulos, así que
 * no puede importar TypeScript del proyecto. Mantener las dos copias en sync
 * es más barato que el fallo que evitan.
 *
 * Sin esto, un valor con comillas ("https://sitio.com", que es lo que se copia
 * al pegar desde .env) o sin protocolo hace que Astro aborte el build con un
 * "Invalid URL" que no dice qué variable ni qué valor.
 */
function normalizeSiteUrl(raw) {
  if (!raw) return undefined;

  let value = String(raw).trim();

  const unquoted = value.replace(/^["']|["']$/g, '');
  if (unquoted !== value) {
    console.warn('[config] PUBLIC_SITE_URL traía comillas y se han quitado. En Vercel el valor va sin comillas.');
    value = unquoted.trim();
  }

  if (!/^https?:\/\//.test(value)) {
    console.warn('[config] PUBLIC_SITE_URL no incluía protocolo; se asume https://');
    value = `https://${value}`;
  }

  // Sin slash final: debe coincidir EXACTAMENTE con BETTER_AUTH_URL.
  value = value.replace(/\/+$/, '');

  try {
    new URL(value);
  } catch {
    throw new Error(
      `[config] PUBLIC_SITE_URL no es un URL válido. Valor recibido: ${JSON.stringify(raw)}. ` +
        'Se espera algo como https://laboratorio.tudominio.com (sin comillas y sin slash final).',
    );
  }

  return value;
}

const siteUrl = normalizeSiteUrl(process.env.PUBLIC_SITE_URL);

// Fallar ruidosamente antes que emitir canonical/OG/sitemap apuntando a localhost.
if (!siteUrl && process.env.VERCEL) {
  throw new Error(
    '[config] PUBLIC_SITE_URL no está definida. Cárgala en Vercel -> Settings -> Environment Variables.',
  );
}

export default defineConfig({
  site: siteUrl ?? 'http://localhost:4321',

  // SSG por defecto. Las rutas de /admin y /api optan por SSR
  // con `export const prerender = false` (Tandas 4-8).
  output: 'static',

  adapter: vercel({
    imageService: true,
    webAnalytics: { enabled: false },

    // CRÍTICO: el middleware debe correr en runtime Node, no Edge.
    // El driver `mongodb` (sockets TCP) y Better Auth no funcionan en Edge.
    // 'classic' es el default, pero se declara explícito para que nadie
    // lo cambie a 'edge' sin entender que rompe la conexión a Atlas.
    middlewareMode: 'classic',

    maxDuration: 15,
  }),

  integrations: [
    react(),
    sitemap({
      // El dashboard, la API y las pantallas de sesión nunca se indexan.
      filter: (page) =>
        !['/admin', '/api', '/login', '/registro'].some((path) =>
          new URL(page).pathname.startsWith(path),
        ),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  prefetch: { prefetchAll: false },
});
