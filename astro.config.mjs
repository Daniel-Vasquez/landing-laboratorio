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

const siteUrl = process.env.PUBLIC_SITE_URL;

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
