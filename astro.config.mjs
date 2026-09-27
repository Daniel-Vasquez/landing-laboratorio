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

/**
 * Caché de dependencias SEPARADA para `build` y para `dev`.
 *
 * Vite pre-empaqueta las dependencias en `node_modules/.vite`, y `astro dev` y
 * `astro build` comparten ese directorio. El build corre en modo producción, así
 * que resuelve `react` a `react.production.js`; el servidor de desarrollo
 * reutiliza después esa caché y sirve el runtime JSX de DESARROLLO contra unos
 * internals de PRODUCCIÓN, que no exponen `getOwner`:
 *
 *   TypeError: dispatcher.getOwner is not a function
 *
 * Reproducido: `dev` en frío empaqueta `react.development.js` (40 KB) y, tras un
 * `npm run build`, el mismo archivo pasa a ser `react.production.js` (20 KB).
 * Solo se manifiesta en local, porque el build de producción no usa el
 * optimizador.
 *
 * La caché de desarrollo se reserva EXCLUSIVAMENTE para `astro dev`. No basta
 * con apartar `astro build`: `astro check` también corre en modo producción y
 * envenenaba la caché igual (verificado). Cualquier comando que no sea el
 * servidor de desarrollo usa el directorio aparte.
 */
const isDevServer = process.argv.includes('dev');

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

  security: {
    /**
     * El default de Astro son 1 MB, por debajo del peso de una foto normal: el
     * administrador recibiría un `413 Request body exceeds 1048576 bytes` del
     * framework antes de que corriera ninguna validación propia.
     *
     * Se sube a 6 MB, justo por encima del límite de 5 MB que aplica la action
     * `images.replace`. Así el rechazo siempre llega con un mensaje útil
     * ("La imagen pesa X MB, el máximo son 5") en lugar de un error crudo.
     *
     * Sigue por debajo del tope de 4.5 MB de body que imponen las funciones
     * serverless de Vercel para el contenido ya decodificado, así que el límite
     * efectivo en producción lo marca la action, no la plataforma.
     */
    actionBodySizeLimit: 6 * 1024 * 1024,
  },

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
    cacheDir: isDevServer ? 'node_modules/.vite' : 'node_modules/.vite-build',

    plugins: [tailwindcss()],

    optimizeDeps: {
      /**
       * Pre-empaquetado explícito de las dependencias de cliente.
       *
       * Sin esto, Vite las descubre tarde: los islands del panel solo se cargan
       * al entrar a /admin/contenido/[key], y ahí re-optimiza y ROTA el
       * `browserHash`. Los módulos ya servidos siguen pidiendo el hash viejo,
       * reciben un 504, y el import del runtime JSX queda sin resolver:
       *
       *   TypeError: _jsxDEV is not a function
       *
       * Declarándolas aquí, el conjunto está completo al arrancar el servidor y
       * el hash no cambia a mitad de sesión. Solo afecta a `astro dev`: el
       * build de producción no usa el optimizador.
       */
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'better-auth/client',
        'zod',
        /**
         * El cliente de Astro Actions. Es el que de verdad llegaba tarde: no
         * lo carga ninguna página pública, solo el primer island del panel que
         * llama a `actions.*`, que es justo el editor de contenido.
         */
        'astro/actions/runtime/entrypoints/client.js',
      ],
    },
  },

  prefetch: { prefetchAll: false },
});
