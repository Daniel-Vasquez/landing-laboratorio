# Plan de Desarrollo — Landing Laboratorio Clínico Hospital Cristal + CMS propio

> **Documento de ejecución secuencial.** Cada "Tanda" es una iteración cerrada, verificable y
> desplegable. Una IA (o dev) debe poder ejecutar una Tanda completa sin leer las siguientes.
> No avanzar a la Tanda N+1 sin cumplir el bloque **Criterios de aceptación** de la Tanda N.

---

## 0. Decisiones de arquitectura (leer antes de escribir código)

### 0.1 Correcciones al stack solicitado

| Solicitado | Realidad técnica | Decisión adoptada |
|---|---|---|
| `output: 'hybrid'` | Eliminado en Astro 5. `static` + `prerender=false` por ruta lo reemplaza. | `output: 'static'` con `adapter: vercel()`. Cada ruta de `/admin` y `/api` declara `export const prerender = false`. |
| `@better-auth/mongo-adapter` | **Mi corrección inicial era errónea: el paquete SÍ existe** y es dependencia directa de `better-auth@1.7.6`, que lo re-exporta. | `import { mongodbAdapter } from "better-auth/adapters/mongodb"` — vía el core, para no fijar a mano una versión que better-auth ya pinea. Firma real: `mongodbAdapter(db, { client?, usePlural?, transaction? })`. |
| Integración `@astrojs/tailwind` | Deprecada a favor del plugin Vite de Tailwind v4. | `@tailwindcss/vite` declarado en `vite.plugins` de `astro.config.mjs`. |
| `edgeMiddleware: false` | Deprecado en `@astrojs/vercel` v11. | `middlewareMode: 'classic'` (mismo efecto: middleware en runtime Node). |
| React para el toggle de tema y el menú móvil | El runtime de React DOM pesa ~66 KB gzip. **Medido en Tanda 1: 72 KB con React vs 1.97 KB sin él.** | Ambos reescritos en vanilla (`.astro` + `<dialog>` nativo). React queda **solo** en `/admin`. |
| Mongoose / ODM | Innecesario: no hay relaciones complejas ni modelos vivos. Añade peso al bundle serverless y latencia de cold start. | Driver nativo `mongodb` + validación con **Zod** en el borde (server actions). Zod es la única fuente de verdad del esquema. |

### 0.2 Principio rector: Build-time vs Request-time

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  BUILD TIME (SSG)            │        │  REQUEST TIME (SSR)          │
│  vercel build                │        │  Vercel Node Function        │
├──────────────────────────────┤        ├──────────────────────────────┤
│  src/pages/index.astro       │        │  src/pages/admin/**          │
│  lee MongoDB 1 vez           │        │  src/pages/api/**            │
│  → HTML estático inmutable   │        │  src/actions/**              │
│  0 queries en producción     │        │  lee/escribe MongoDB por req  │
└──────────────────────────────┘        └──────────────────────────────┘
                 ▲                                      │
                 │                                      │ al guardar contenido
                 │        ┌─────────────────────┐        │
                 └────────│ Vercel Deploy Hook  │◀───────┘
                          │ (POST, debounced)   │
                          └─────────────────────┘
```

**Regla invariable:** ningún componente de la landing puede importar `src/lib/mongo.ts`
directamente. Solo el módulo `src/lib/content/repository.ts` toca la base, y solo es invocado
desde el frontmatter de páginas prerenderizadas o desde server actions.

### 0.3 Modelo de datos (MongoDB Atlas, DB única)

| Colección | Dueño | Propósito |
|---|---|---|
| `user` | Better Auth | `{ _id, name, email, emailVerified, createdAt, updatedAt }` |
| `session` | Better Auth | Sesiones activas (cookie-based) |
| `account` | Better Auth | Credenciales (hash de password en `account.password`) |
| `verification` | Better Auth | Tokens. Se crea aunque no usemos verificación. |
| `landing_sections` | App | **Documento por sección.** `{ _id: SectionKey, data: object, updatedAt: Date, updatedBy: { userId, name, email } \| null }` — **la clave de sección ES el `_id`** (ver 0.3.1). |
| `app_meta` | App | Singletons de sistema. Docs con `_id` string: `"last_change"`, `"deploy_state"`. |
| `landing_images` | App | **Una fila por ranura de imagen** (Tanda 11). `_id` = `slotId` del registro en código. `{ publicId, version, width, height, format, bytes, alt, updatedAt, updatedBy }` |

**Por qué documento-por-sección y no un único doc `landing`:** permite guardado granular
(un editor toca solo el Hero → un solo `updateOne`) y evita conflictos de escritura concurrente.

### 0.3.1 La clave de sección es el `_id` (desviación aplicada en Tanda 2)

En lugar de `_id: ObjectId` más un índice único sobre un campo `key`, se usa la clave de
sección directamente como `_id`. MongoDB ya indexa `_id` como único, así que:

- las claves duplicadas son **imposibles por construcción**, no por un índice que mantener;
- se elimina un índice y un modo de fallo completo;
- `findOne({ _id: 'hero' })` usa el índice primario, sin lookup secundario.

También se eliminó el campo `order`: el orden de render lo fija el orden de los componentes en
`index.astro`, y el del dashboard lo fija `SECTION_KEYS`. Un `order` en la base sería un tercer
lugar donde el orden puede desincronizarse.

`landing_sections.key` — enum cerrado, derivado de `copy.md`:

```
hero | estudios_principales | por_que_estudios | estudios_adicionales
por_que_hospital | testimonios | faq | cta_final | avisos | seo | videos
```

`app_meta` singletons:

```jsonc
// _id: "last_change"
{ "_id": "last_change", "userId": "...", "name": "Daniel Vásquez",
  "email": "...", "at": ISODate, "sectionKey": "hero" }

// _id: "deploy_state"  (control de debounce del webhook)
{ "_id": "deploy_state", "lastTriggeredAt": ISODate, "pending": false,
  "lastStatus": "ok" | "error", "lastError": null, "triggerCount": 0 }
```

### 0.4 Paleta y tokens de diseño

Colores entregados: `#eaedf2`, `#0d9488`, `#fafafa`, `#0284c7`, `#e9e9eb`.
Tema **Light es el principal**; Dark se deriva.

| Token semántico | Light | Dark (derivado) | Uso |
|---|---|---|---|
| `--color-bg` | `#fafafa` | `#0b1220` | Fondo de página |
| `--color-surface` | `#ffffff` | `#111a2b` | Tarjetas, acordeones |
| `--color-surface-muted` | `#eaedf2` | `#1a2438` | Bandas alternas de sección |
| `--color-border` | `#e9e9eb` | `#243049` | Bordes, divisores |
| `--color-primary` | `#0d9488` | `#2dd4bf` | CTA principal "Agenda tu estudio" |
| `--color-primary-fg` | `#ffffff` | `#04211f` | Texto sobre primary |
| `--color-accent` | `#0284c7` | `#38bdf8` | Links, iconos, datos estadísticos |
| `--color-fg` | `#0f172a` | `#eaedf2` | Texto principal |
| `--color-fg-muted` | `#475569` | `#a3aec2` | Texto secundario |

> **CORRECCIÓN (Tanda 9, medido con `npm run a11y:contrast`): las dos cifras de arriba estaban
> mal, y la paleta entregada NO cumple AA en el tema Light.**
>
> | Combinación | Afirmado antes | Medido | AA |
> |---|---|---|---|
> | `#0d9488` como fondo de botón, texto blanco | 4.6:1 | **3.74:1** | ✗ |
> | `#0284c7` como texto sobre `#fafafa` | 4.6:1 | **3.92:1** | ✗ |
> | `#0284c7` como texto sobre `#eaedf2` | — | **3.49:1** | ✗ |
> | `#0d9488` como TEXTO sobre `#ffffff` (sidebar activo) | — | **3.74:1** | ✗ |
>
> Corregido bajando un paso cada familia en el tema Light: `#0d9488` → **`#0f766e`** (5.47:1 ✓)
> y `#0284c7` → **`#0369a1`** (5.06:1 en el peor fondo ✓). Los tres colores no cromáticos de la
> paleta (`#eaedf2`, `#fafafa`, `#e9e9eb`) se usan tal cual. El tema Dark ya cumplía en todo.
>
> Añadido `--c-border-strong` (`#8a8a8f` light / `#5b6b8c` dark) para el borde de los controles:
> WCAG 1.4.11 exige 3:1 al límite de un control, y `#e9e9eb` da **1.16:1**, que vuelve los
> inputs casi invisibles. Los bordes decorativos de tarjeta siguen con `--c-border` (exentos).

### 0.5 Estructura de directorios objetivo

```
landing-laboratorio/
├── astro.config.mjs
├── tsconfig.json
├── vercel.json
├── .env.example                 # ← entregado en esta misma tarea
├── copy.md
├── planificacion.md
├── src/
│   ├── env.d.ts
│   ├── middleware.ts            # protección /admin + inyección de user en locals
│   ├── actions/
│   │   └── index.ts             # Astro Actions (server): content.*, deploy.*
│   ├── lib/
│   │   ├── mongo.ts             # cliente singleton (cache global)
│   │   ├── auth.ts              # instancia Better Auth (server)
│   │   ├── auth-client.ts       # cliente Better Auth (browser)
│   │   ├── deploy.ts            # trigger del Vercel Deploy Hook + debounce
│   │   ├── audit.ts             # escritura/lectura de app_meta:last_change
│   │   └── content/
│   │       ├── schemas.ts       # Zod por sección + tipos inferidos
│   │       ├── repository.ts    # get/set de landing_sections
│   │       └── seed.ts          # payload inicial extraído de copy.md
│   ├── components/
│   │   ├── landing/             # .astro puros, 0 JS
│   │   │   ├── Hero.astro
│   │   │   ├── EstudiosPrincipales.astro
│   │   │   ├── PorQueEstudios.astro
│   │   │   ├── EstudiosAdicionales.astro
│   │   │   ├── PorQueHospital.astro
│   │   │   ├── Testimonios.astro
│   │   │   ├── Faq.astro
│   │   │   ├── CtaFinal.astro
│   │   │   ├── Videos.astro
│   │   │   ├── Header.astro
│   │   │   └── Footer.astro
│   │   ├── ui/
│   │   │   ├── ThemeToggle.tsx   # React island
│   │   │   ├── MobileNav.tsx     # React island
│   │   │   └── Button.astro
│   │   └── admin/                # React islands (formularios)
│   │       ├── SectionEditor.tsx
│   │       ├── RepeaterField.tsx
│   │       ├── AuthForm.tsx
│   │       └── DeployStatus.tsx
│   ├── layouts/
│   │   ├── LandingLayout.astro
│   │   └── AdminLayout.astro
│   ├── pages/
│   │   ├── index.astro           # SSG
│   │   ├── login.astro           # SSR
│   │   ├── registro.astro        # SSR
│   │   ├── admin/
│   │   │   ├── index.astro       # SSR — lista de secciones
│   │   │   ├── contenido/[key].astro  # SSR — editor de sección
│   │   │   └── usuarios.astro    # SSR — último autor de cambios
│   │   └── api/
│   │       └── auth/[...all].ts  # SSR — handler Better Auth
│   └── styles/
│       └── global.css            # @import "tailwindcss" + @theme + tokens
└── scripts/
    ├── seed.ts                   # node --env-file=.env → puebla landing_sections
    └── ensure-indexes.ts         # índices únicos
```

---

## TANDA 1 — Scaffolding, Tailwind v4, tokens y tema Light/Dark

**Objetivo:** proyecto Astro corriendo en local, deployable a Vercel, con sistema de temas
funcional y sin FOUC. Cero MongoDB todavía.

### 1.1 Inicialización

```bash
npm create astro@latest . -- --template minimal --typescript strict --no-install --no-git
npm i
npx astro add react vercel --yes
npm i -D @tailwindcss/vite tailwindcss
npm i mongodb better-auth zod
```

### 1.2 `astro.config.mjs`

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321',
  output: 'static',                       // SSG por defecto
  adapter: vercel({
    imageService: true,
    webAnalytics: { enabled: false },
    middlewareMode: 'classic',            // CRÍTICO: middleware en Node, no Edge.
                                          // Better Auth + driver mongodb NO corren en Edge.
                                          // ('edgeMiddleware' existe pero está deprecado.)
  }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
  prefetch: { prefetchAll: false },
});
```

> **`middlewareMode: 'classic'` es obligatorio.** Con `'edge'`, `src/middleware.ts` se compila al
> runtime Edge y el driver `mongodb` (sockets TCP) falla en build/runtime.
>
> **`PUBLIC_SITE_URL` debe normalizarse antes de asignarla a `site`.** Astro la valida con
> `new URL()` y aborta el build con un `Invalid URL` que no identifica la variable. Los dos
> valores que lo provocan son los dos errores más fáciles de cometer al cargarla en un panel de
> hosting: con comillas (`"https://sitio.com"`, que es lo que se copia al pegar desde `.env`) y
> sin protocolo (`sitio.com`). La normalización se duplica en `astro.config.mjs` porque ese
> archivo se carga antes de que exista pipeline de módulos y no puede importar TypeScript.

> **`astro.config.mjs` NO lee `.env`.** Corre en Node antes de que Vite cargue los archivos de
> entorno, así que `process.env` solo trae variables reales de la shell. En Vercel eso basta,
> pero en local `site` caería en su valor por defecto sin avisar. Solución aplicada:
> `process.loadEnvFile('.env')` dentro de un `try/catch` al inicio del config, más un `throw`
> si falta `PUBLIC_SITE_URL` cuando `process.env.VERCEL` está presente.

### 1.3 `src/styles/global.css`

```css
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --color-brand-500: #0d9488;
  --color-brand-400: #2dd4bf;
  --color-accent-500: #0284c7;
  --color-accent-400: #38bdf8;
}

:root {
  color-scheme: light;
  --color-bg: #fafafa;
  --color-surface: #ffffff;
  --color-surface-muted: #eaedf2;
  --color-border: #e9e9eb;
  --color-primary: #0d9488;
  --color-primary-fg: #ffffff;
  --color-accent: #0284c7;
  --color-fg: #0f172a;
  --color-fg-muted: #475569;
}

.dark {
  color-scheme: dark;
  --color-bg: #0b1220;
  --color-surface: #111a2b;
  --color-surface-muted: #1a2438;
  --color-border: #243049;
  --color-primary: #2dd4bf;
  --color-primary-fg: #04211f;
  --color-accent: #38bdf8;
  --color-fg: #eaedf2;
  --color-fg-muted: #a3aec2;
}

@layer base {
  html { scroll-behavior: smooth; }
  body {
    background-color: var(--color-bg);
    color: var(--color-fg);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
```

**Convención de uso en clases — indirección de dos niveles (implementada en Tanda 1):**

En lugar de escribir `bg-[var(--color-bg)]` en cada componente, los tokens de `@theme`
**apuntan** a variables crudas que se redefinen por tema:

```css
@theme { --color-bg: var(--c-bg); /* ...los 9 tokens */ }
:root  { --c-bg: #fafafa; }   /* Light */
.dark  { --c-bg: #0b1220; }   /* Dark  */
```

Resultado: `bg-bg`, `text-fg-muted`, `border-border` son utilidades reales de Tailwind **y**
cambian con la clase `.dark`, porque `var()` resuelve en el momento de uso. Verificado en el
CSS compilado: las 9 utilidades se generan y `.dark` queda **después** de `:root` (ambos tienen
especificidad 0,1,0, así que el orden es lo que hace ganar al tema oscuro).

`dark:` requiere declarar la estrategia de clase explícitamente, porque el default de Tailwind 4
es `prefers-color-scheme`:
```css
@custom-variant dark (&:where(.dark, .dark *));
```

> **Trampa del scanner:** Tailwind 4 lee el código fuente como **texto**. Una clase interpolada
> como `` class={`bg-${token.name}`} `` NO genera CSS. Guarda siempre la clase completa como
> string literal (`swatch: 'bg-primary'`) y aplícala con `class:list`.

### 1.4 Estrategia de tema (Light default, sin FOUC)

Usar **estrategia de clase `.dark` en `<html>`** (no `prefers-color-scheme` como fuente de
verdad, porque Light es la paleta principal por requerimiento).

**Script bloqueante `is:inline` en el `<head>` de AMBOS layouts** — debe ir antes de cualquier CSS:

```astro
<script is:inline>
  (() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'dark') document.documentElement.classList.add('dark');
      // Sin valor almacenado → Light. No se consulta prefers-color-scheme:
      // Light es la paleta principal por requerimiento de negocio.
    } catch {}
  })();
</script>
```

`src/components/ui/ThemeToggle.tsx` (React island, `client:load`):

- Estado inicial leído de `document.documentElement.classList.contains('dark')`.
- `toggle()` → alterna clase + `localStorage.setItem('theme', next)`.
- `aria-label` dinámico ("Activar tema oscuro" / "Activar tema claro"), `aria-pressed`.
- Renderiza icono sol/luna como SVG inline (no librería de iconos).

> **Por qué `client:load` y no `client:idle`:** el toggle es un control de chrome visible en el
> primer viewport; `client:idle` puede dejarlo muerto 1–2s en móviles lentos.

### 1.5 `LandingLayout.astro`

Props: `{ title: string; description: string; keywords?: string[] }`.
Contiene: `<html lang="es-MX">`, script de tema inline, meta viewport, canonical,
OpenGraph, `<slot />`, y el `Header`/`Footer`. Importa `global.css`.

### 1.6 Criterios de aceptación Tanda 1

- [ ] `npm run dev` sirve `/` sin errores.
- [ ] `npm run build` genera `dist/` con `index.html` estático.
- [ ] Toggle alterna tema, persiste tras recarga, y **no hay flash blanco→oscuro** al recargar en dark.
- [ ] Lighthouse local en `/`: Performance ≥ 95, Accessibility ≥ 95.
- [ ] `git push` → Vercel construye verde (aún sin env vars de Mongo).

---

## TANDA 2 — Capa de datos: cliente Mongo, esquemas Zod, repositorio y seed

**Objetivo:** MongoDB Atlas conectado, esquemas cerrados, y `landing_sections` poblada con el
contenido de `copy.md`. Sin UI.

### 2.1 `src/lib/mongo.ts` — singleton con cache global

```ts
import { MongoClient, type Db } from 'mongodb';

const uri = import.meta.env.MONGODB_URI ?? process.env.MONGODB_URI;
const dbName = import.meta.env.MONGODB_DB_NAME ?? process.env.MONGODB_DB_NAME;

if (!uri) throw new Error('[mongo] MONGODB_URI no definida');
if (!dbName) throw new Error('[mongo] MONGODB_DB_NAME no definida');

// Cache en globalThis: en Vercel las funciones serverless reutilizan el proceso entre
// invocaciones (warm starts). Sin esto se abre un pool nuevo por request y Atlas
// rechaza por connection limit.
const g = globalThis as typeof globalThis & { __mongoClient?: MongoClient };

export const client: MongoClient =
  g.__mongoClient ?? new MongoClient(uri, {
    maxPoolSize: 5,              // serverless: pools pequeños, muchas instancias
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  });

if (!g.__mongoClient) g.__mongoClient = client;

export const db: Db = client.db(dbName);
export const collections = {
  sections: db.collection('landing_sections'),
  meta: db.collection('app_meta'),
  users: db.collection('user'),
} as const;
```

> **CORRECCIÓN (verificada en Tanda 2): usar SOLO `process.env` en código de servidor.**
> El patrón `import.meta.env.X ?? process.env.X` **lanza `TypeError`** en un script Node plano,
> porque ahí `import.meta.env` es `undefined` y se lee `.X` sobre undefined. Además Vite solo
> reescribe accesos estáticos, nunca dinámicos.
>
> `process.env` cubre los tres contextos: el build (gracias a `process.loadEnvFile` en
> `astro.config.mjs`), los scripts (`node --env-file=.env`) y Vercel (env vars reales).
> Centralizado en `src/lib/env.ts` con `requireEnv` / `optionalEnv` / `boolEnv` / `intEnv`.
>
> **La conexión debe ser perezosa (`getDb()`), no un `export const db` de nivel superior.**
> Un `throw` al importar el módulo impediría que el fallback a contenido semilla del
> repositorio llegara a ejecutarse.

> **Node ESM exige extensiones explícitas.** Los módulos de `src/lib` se importan también desde
> `scripts/` ejecutados con `node` directamente, así que sus especificadores llevan `.ts`
> (`from './env.ts'`) y `tsconfig.json` necesita `allowImportingTsExtensions` + `noEmit`.
> Vite resuelve ambas formas; Node solo la explícita.

> **Node 26 ejecuta TypeScript sin flags.** Sobra `--experimental-strip-types` en los scripts:
> basta `node --env-file=.env scripts/seed.ts`.

### 2.2 `src/lib/content/schemas.ts` — Zod como única fuente de verdad

Un schema por sección. Ejemplos derivados literalmente de `copy.md`:

```ts
import { z } from 'zod';

const cta = z.object({
  label: z.string().min(1).max(60),
  href: z.string().min(1),        // "#contacto" o URL absoluta de WhatsApp
});

export const heroSchema = z.object({
  headline: z.string().min(10).max(160),
  subheadline: z.string().min(10).max(320),
  bullets: z.array(z.string().min(3).max(120)).min(1).max(6),
  address: z.string().min(5).max(200),
  cta,
});

export const estudioSchema = z.object({
  nombre: z.string().min(3).max(80),
  descripcion: z.string().min(10).max(300),
});

export const estudiosPrincipalesSchema = z.object({
  eyebrow: z.string().max(60),
  intro: z.string().min(10).max(400),
  estudios: z.array(estudioSchema).min(1).max(12),
  cta,
});

export const porQueEstudiosSchema = z.object({
  eyebrow: z.string().max(80),
  intro: z.string().min(10).max(600),
  datosLabel: z.string().max(80),        // "Estos datos lo confirman:"
  datos: z.array(z.string().min(10).max(400)).min(1).max(8),
  cierre: z.string().max(500),
  cta,
});

export const estudiosAdicionalesSchema = z.object({
  eyebrow: z.string().max(60),
  intro: z.string().max(400),
  items: z.array(z.object({
    titulo: z.string().min(3).max(80),
    detalle: z.string().max(200),
  })).min(1).max(20),
  cta,
});

export const porQueHospitalSchema = z.object({
  eyebrow: z.string().max(60),
  beneficios: z.array(z.object({
    titulo: z.string().min(3).max(80),
    descripcion: z.string().min(10).max(300),
  })).min(1).max(10),
  cta,
});

export const testimoniosSchema = z.object({
  eyebrow: z.string().max(60),
  items: z.array(z.object({
    quote: z.string().min(20).max(500),
    autor: z.string().min(2).max(80),
  })).min(1).max(12),
  cta,
});

export const faqSchema = z.object({
  eyebrow: z.string().max(60),
  items: z.array(z.object({
    pregunta: z.string().min(5).max(200),
    respuesta: z.string().min(10).max(800),
  })).min(1).max(20),
  cta,
});

export const ctaFinalSchema = z.object({
  headline: z.string().min(5).max(120),
  body: z.string().min(10).max(400),
  cta,
});

export const avisosSchema = z.object({
  permisoCofepris: z.string().max(60),
  items: z.array(z.string().max(300)).max(8),
  privacidadHref: z.string().max(300),
});

export const seoSchema = z.object({
  title: z.string().min(10).max(70),          // límite SERP
  description: z.string().min(50).max(160),   // límite SERP
  keywords: z.array(z.string().min(3).max(80)).max(20),
  ogImage: z.string().max(300).optional(),
});

export const videosSchema = z.object({
  eyebrow: z.string().min(1).max(60),
  intro: z.string().max(300),
  // Cada video lleva título y thumbnail propios: el patrón facade (3.3) necesita
  // un texto accesible y una imagen local, no solo la URL.
  items: z.array(z.object({
    url: z.url().max(300),          // Zod 4: `z.url()`, NO el deprecado `z.string().url()`
    titulo: z.string().min(3).max(120),
    thumbnail: z.string().max(300).default(''),
  })).max(12),
});

export const SECTION_SCHEMAS = {
  hero: heroSchema,
  estudios_principales: estudiosPrincipalesSchema,
  por_que_estudios: porQueEstudiosSchema,
  estudios_adicionales: estudiosAdicionalesSchema,
  por_que_hospital: porQueHospitalSchema,
  testimonios: testimoniosSchema,
  faq: faqSchema,
  cta_final: ctaFinalSchema,
  avisos: avisosSchema,
  seo: seoSchema,
  videos: videosSchema,
} as const;

export type SectionKey = keyof typeof SECTION_SCHEMAS;
export const SECTION_KEYS = Object.keys(SECTION_SCHEMAS) as SectionKey[];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: 'Hero',
  estudios_principales: 'Estudios principales',
  por_que_estudios: '¿Por qué hacerte estudios?',
  estudios_adicionales: 'Estudios adicionales',
  por_que_hospital: '¿Por qué en Hospital Cristal?',
  testimonios: 'Testimonios',
  faq: 'Preguntas frecuentes',
  cta_final: 'CTA final',
  avisos: 'Avisos y confianza',
  seo: 'SEO / Metadatos',
  videos: 'Videos de Instagram',
};

export type LandingContent = {
  [K in SectionKey]: z.infer<(typeof SECTION_SCHEMAS)[K]>
};
```

### 2.3 `src/lib/content/seed.ts`

Objeto `SEED: LandingContent` transcribiendo **textualmente** `copy.md`. Reglas de transcripción:

- Cada `[Agenda tu estudio]` → `cta: { label: 'Agenda tu estudio', href: '#agendar' }`.
- Los 6 estudios principales (biometría hemática, química sanguínea, examen general de orina,
  hemoglobina glucosilada, perfil de lípidos, perfil tiroideo) van a `estudios[]` con su
  descripción exacta.
- Los 11 bullets de estudios adicionales se parten en `{ titulo, detalle }` por el `:`
  (ej. `"Check ups completos"` / `"básico, masculino, femenino y para control de diabetes"`).
- Los 6 beneficios de "¿Por qué en Hospital Cristal?" → `beneficios[]`.
- Los 3 testimonios y las 5 FAQ, literales.
- `seo.title` = "Laboratorio Clínico en Zumpango | Resultados el Mismo Día | Hospital Cristal"
  (verificar ≤ 70 chars — son 74, **recortar a** "Laboratorio Clínico en Zumpango | Resultados el Mismo Día" y dejar el sufijo de marca al template del layout).
- `videos.urls` = los 7 permalinks de Instagram. **Des-escapar** `Da58\_GTAEju` → `Da58_GTAEju`.
- `avisos.permisoCofepris` = "253300201A2234".

### 2.4 `src/lib/content/repository.ts`

```ts
export async function getSection<K extends SectionKey>(key: K): Promise<LandingContent[K]>
export async function getLandingContent(): Promise<LandingContent>   // 1 find(), N docs
export async function setSection<K extends SectionKey>(
  key: K, data: LandingContent[K], editor: { userId: string; name: string; email: string }
): Promise<void>
export async function listSectionsMeta(): Promise<Array<{ key, label, updatedAt, updatedBy }>>
```

Reglas de implementación:

1. `getLandingContent()` hace **una sola** query (`find({}).toArray()`), no N queries.
2. Cada doc se pasa por `SECTION_SCHEMAS[key].safeParse`. Si falla → warning en consola y se
   usa `SEED[key]` como fallback. **El build nunca debe romper por un doc corrupto**, pero sí
   debe dejar rastro en el log de Vercel.
3. Si una sección **no existe** en la base → se usa `SEED[key]`. Esto hace el primer deploy
   idempotente incluso antes de correr el seed.
4. Si `MONGODB_URI` no está definida y `CONTENT_FALLBACK_TO_SEED=true` → devolver `SEED`
   completo sin conectar. Permite `npm run build` en CI/local sin credenciales.
5. `setSection` hace `updateOne({ key }, { $set: { data, updatedAt, updatedBy } }, { upsert: true })`
   y **en la misma operación lógica** actualiza `app_meta:last_change` (ver Tanda 8).

### 2.5 `scripts/ensure-indexes.ts` y `scripts/seed.ts`

`ensure-indexes.ts`:
```
user:     { email: 1 } unique
session:  { token: 1 } unique, { expiresAt: 1 } TTL (expireAfterSeconds: 0)
account:  { userId: 1 }
```
`landing_sections` **no necesita índice**: su clave es el `_id` (ver 0.3.1).

`seed.ts`: itera `SECTION_KEYS`, hace `updateOne({key}, {$setOnInsert: {...}}, {upsert:true})`.
**`$setOnInsert`, no `$set`** — correr el seed dos veces no debe pisar ediciones del cliente.

`package.json`:
```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "db:indexes": "node --env-file=.env scripts/ensure-indexes.ts",
    "db:seed": "node --env-file=.env scripts/seed.ts"
  }
}
```

### 2.6 Atlas: configuración obligatoria

- Cluster M0 (free) es suficiente. Región: `us-east-1` (misma que Vercel default → menor RTT).
- **Network Access → `0.0.0.0/0`.** Vercel no publica rangos IP fijos para serverless.
  Mitigación: usuario de DB con rol `readWrite` sobre **una sola** base, password de 32+ chars.
- Crear 2 usuarios: `app_rw` (runtime) y opcionalmente `build_ro` si se quiere que el build solo lea.

### 2.7 Criterios de aceptación Tanda 2

- [ ] `npm run db:indexes` crea los 4 índices sin error.
- [ ] `npm run db:seed` inserta 11 documentos en `landing_sections`.
- [ ] Ejecutar `db:seed` dos veces no duplica ni modifica documentos (verificar `updatedAt`).
- [ ] Un script de prueba que llama `getLandingContent()` devuelve las 11 claves tipadas.
- [ ] Corromper a mano el `data` del doc `hero` en Atlas → `getLandingContent()` devuelve el
      seed del hero y loguea un warning, sin lanzar excepción.

---

## TANDA 3 — Landing SSG consumiendo MongoDB en build time

**Objetivo:** `/` completamente renderizada desde la base, 100% estática, 0 JS salvo el toggle.

### 3.1 `src/pages/index.astro`

```astro
---
import LandingLayout from '../layouts/LandingLayout.astro';
import { getLandingContent } from '../lib/content/repository';
import Hero from '../components/landing/Hero.astro';
// ...resto de secciones

export const prerender = true;   // explícito, aunque sea el default

const c = await getLandingContent();
---
<LandingLayout title={c.seo.title} description={c.seo.description} keywords={c.seo.keywords}>
  <Hero data={c.hero} />
  <EstudiosPrincipales data={c.estudios_principales} />
  <PorQueEstudios data={c.por_que_estudios} />
  <EstudiosAdicionales data={c.estudios_adicionales} />
  <PorQueHospital data={c.por_que_hospital} />
  <Testimonios data={c.testimonios} />
  <Videos data={c.videos} />
  <Faq data={c.faq} />
  <CtaFinal data={c.cta_final} />
</LandingLayout>
```

### 3.2 Reglas para los componentes `landing/*.astro`

1. **Cero `client:*`.** Todos son `.astro` puros. El único island de la landing es `ThemeToggle`
   (en `Header.astro`) y `MobileNav`.
2. Props tipadas: `interface Props { data: LandingContent['hero'] }`.
3. **FAQ sin JavaScript:** usar `<details>`/`<summary>` nativos + `group-open:` de Tailwind para
   rotar el chevron. Accesible por defecto, 0 KB.
4. Alternancia de fondos: secciones impares `bg-[var(--color-bg)]`, pares
   `bg-[var(--color-surface-muted)]`.
5. Cada sección lleva `id` para anclas: `#estudios`, `#por-que`, `#adicionales`, `#beneficios`,
   `#testimonios`, `#faq`, `#agendar`.
6. Jerarquía de headings estricta: un solo `<h1>` (hero headline), `<h2>` por sección,
   `<h3>` por card. Nunca saltar niveles por estética.
7. Los CTAs repetidos (8 en total según `copy.md`) apuntan todos a `#agendar` (bloque final con
   dirección, teléfono y botón de WhatsApp). **No** replicar formularios.

### 3.3 Videos de Instagram — decisión de performance

Los 7 permalinks de Instagram **no deben embeberse con el script oficial de Instagram**
(`embed.js` pesa ~250 KB, hace 10+ requests a terceros y destruye el LCP/CLS).

Estrategia: **facade pattern**.
- Render estático de una tarjeta con `<a href={url} target="_blank" rel="noopener noreferrer">`,
  un thumbnail local (`/public/videos/`, formato AVIF/WebP, descargado una vez) y un icono de play.
- `loading="lazy"`, `decoding="async"`, `width`/`height` explícitos para CLS = 0.
- **Acción manual requerida del cliente:** proveer los 7 thumbnails. Hasta entonces, renderizar
  placeholder con degradado `--color-surface-muted` y el título del post.

### 3.4 SEO técnico

- `LandingLayout` emite: `<title>`, `meta description`, `meta keywords` (bajo valor pero
  solicitado), `link rel=canonical`, OG (`og:title/description/image/type=website/url`),
  `twitter:card=summary_large_image`, `<html lang="es-MX">`.
- **JSON-LD `MedicalBusiness`** inyectado con `set:html={JSON.stringify(schema)}` en un
  `<script type="application/ld+json">`:
  ```
  @type: ["MedicalBusiness","MedicalClinic"], name, address (PostalAddress con
  streetAddress "Melchor Ocampo 233", addressLocality "Zumpango",
  addressRegion "Estado de México", addressCountry "MX"), telephone, openingHours,
  aggregateRating derivado de testimonios (solo si son reseñas verificables),
  hasOfferCatalog con los estudios principales.
  ```
  > **Advertencia legal/SEO:** no emitir `aggregateRating` con 3 testimonios manuales sin
  > fuente verificable — Google penaliza rich snippets fabricados. Emitir `review[]` sin
  > `aggregateRating` es la opción segura.
- `src/pages/robots.txt.ts` y `@astrojs/sitemap`. **`/admin` y `/api` en `Disallow`** +
  `<meta name="robots" content="noindex,nofollow">` en `AdminLayout`.

### 3.5 Criterios de aceptación Tanda 3

- [ ] `npm run build` → `dist/index.html` contiene el texto del hero **en el HTML fuente**
      (verificar con `grep "tranquilidad de saber" dist/index.html`).
- [ ] `dist/` no contiene ningún chunk JS más allá del runtime de React para `ThemeToggle` +
      `MobileNav` (< 60 KB gzip total).
- [ ] Cambiar un texto en Atlas → rebuild → el texto nuevo aparece en `dist/index.html`.
- [ ] Lighthouse mobile en preview: Performance ≥ 95, SEO = 100, Accessibility ≥ 95, CLS = 0.
- [ ] Validar JSON-LD en Rich Results Test sin errores.
- [ ] `<details>` de FAQ abre/cierra con JS deshabilitado en el navegador.

---

## TANDA 4 — Autenticación con Better Auth

**Objetivo:** registro (nombre, correo, password), login, logout, sesión en cookie. Sin 2FA,
sin recuperación de password, sin verificación de email.

### 4.1 `src/lib/auth.ts`

```ts
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { db } from './mongo';

export const auth = betterAuth({
  // `client` habilita transacciones. Atlas (incluido M0) es replica set y las
  // soporta; con un mongod standalone habría que pasar `transaction: false`.
  database: mongodbAdapter(getDbSync(), { client: getClientSync() }),
  secret: import.meta.env.BETTER_AUTH_SECRET,
  baseURL: import.meta.env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: [import.meta.env.PUBLIC_SITE_URL],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,   // requerimiento explícito
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,                  // tras registro, entra directo
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,       // 7 días
    updateAge: 60 * 60 * 24,           // refresca si quedan < 6 días
    cookieCache: { enabled: true, maxAge: 5 * 60 },  // evita 1 query/request
  },
  advanced: {
    cookiePrefix: 'lab',
    useSecureCookies: import.meta.env.PROD,
    defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
  },
});

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;
```

> `session.cookieCache` es importante: sin él, cada request a `/admin` hace un `findOne` en
> `session`. Con él, la sesión se valida desde una cookie firmada durante 5 min.

> **`mongodbAdapter` exige un `Db` SINCRÓNICO**, pero `getDb()` es async. Por eso `mongo.ts`
> expone también `getDbSync()` / `getClientSync()`: el constructor de `MongoClient` y `.db()`
> son sincrónicos y el driver conecta perezosamente en la primera operación. Ambas variantes
> comparten la cache de `globalThis`, para que nunca existan dos pools contra el mismo cluster.

> **`emailAndPassword` NO tiene `disableSignUp`** (esa opción es solo de los proveedores OAuth,
> verificado en el código del paquete). La compuerta de registro se implementa en el handler de
> `/api/auth`, antes de delegar a Better Auth.

### 4.2 `src/pages/api/auth/[...all].ts`

```ts
import type { APIRoute } from 'astro';
import { auth } from '../../../lib/auth';

export const prerender = false;
export const ALL: APIRoute = ({ request }) => auth.handler(request);
```

### 4.3 `src/lib/auth-client.ts`

```ts
import { createAuthClient } from 'better-auth/client';
export const authClient = createAuthClient({ basePath: '/api/auth' });
```
(sin `baseURL`: mismo origen. Evita hardcodear el dominio en el bundle del cliente.)

### 4.4 Control de altas — **decisión de seguridad obligatoria**

`/registro` público en un panel administrativo significa que cualquiera en internet puede
crear una cuenta con permiso de editar la landing. Requerimiento y seguridad chocan aquí.

**Resolución adoptada:** el registro existe y funciona como se pidió, pero queda tras dos
compuertas controladas por entorno:

| Var | Efecto |
|---|---|
| `ALLOW_PUBLIC_SIGNUP=false` | `/registro` responde 404 y la action `signUp` rechaza. Modo producción normal. |
| `SIGNUP_INVITE_CODE=<secreto>` | Si está definida, el formulario exige un campo extra "Código de invitación" que debe coincidir. |

Flujo de puesta en producción: se despliega con `ALLOW_PUBLIC_SIGNUP=true`, se crean las
cuentas del equipo, se cambia a `false` y se redeploya. Documentado en el README.

Implementación: validar ambas en el **server** (middleware para la página, action para el POST).
Nunca confiar en ocultar el link.

### 4.5 Páginas `/login` y `/registro`

- `export const prerender = false` en ambas.
- Si ya hay sesión → `return Astro.redirect('/admin')`.
- Island `AuthForm.tsx` (`client:load`), modo `'login' | 'signup'` por prop.
- Usa `authClient.signIn.email({ email, password })` / `authClient.signUp.email({ name, email, password })`.
- Manejo de error: mapear códigos de Better Auth a mensajes en español. **Nunca** distinguir
  "email no existe" de "password incorrecta" → mensaje único "Correo o contraseña incorrectos"
  (evita enumeración de cuentas).
- Estados: `idle | submitting | error`. Botón deshabilitado con `aria-busy` durante submit.
- Validación cliente con el mismo Zod schema que el server (`authSchemas.ts` compartido).

### 4.6 `src/middleware.ts`

```ts
import { defineMiddleware } from 'astro:middleware';
import { auth } from './lib/auth';

const PROTECTED = /^\/admin(\/|$)/;

export const onRequest = defineMiddleware(async (ctx, next) => {
  // Las rutas prerenderizadas se renderizan en BUILD TIME, sin petición real:
  // leer `ctx.request.headers` ahí emite un warning de Astro y no devuelve nada.
  if (ctx.isPrerendered) return next();

  if (ctx.url.pathname.startsWith('/api/auth')) return next();

  // FALLAR CERRADO: si MongoDB no responde, `getSession` lanza y la ruta daría
  // un 500. Un fallo de base de datos se trata como "sin sesión" -> /login.
  let session = null;
  try {
    session = await auth.api.getSession({ headers: ctx.request.headers });
  } catch (error) { console.error('[auth]', error); }
  ctx.locals.user = session?.user ?? null;
  ctx.locals.session = session?.session ?? null;

  if (PROTECTED.test(ctx.url.pathname) && !session) {
    const to = encodeURIComponent(ctx.url.pathname + ctx.url.search);
    return ctx.redirect(`/login?redirect=${to}`, 302);
  }
  return next();
});
```

`src/env.d.ts`:
```ts
declare namespace App {
  interface Locals {
    user: { id: string; name: string; email: string } | null;
    session: { id: string; expiresAt: Date } | null;
  }
}
```

> **Defensa en profundidad:** el middleware protege la navegación, pero **cada server action
> revalida la sesión por su cuenta** (Tanda 6). Un middleware no es suficiente: las actions
> son endpoints POST alcanzables directamente.

### 4.7 Criterios de aceptación Tanda 4

- [ ] `POST /api/auth/sign-up/email` crea docs en `user` y `account`; `account.password` es un hash (no texto plano).
- [ ] Login setea cookie `lab.session_token` con `HttpOnly`, `Secure` (en prod), `SameSite=Lax`.
- [ ] `GET /admin` sin sesión → 302 a `/login?redirect=%2Fadmin`.
- [ ] Tras login exitoso redirige al `?redirect=` original.
- [ ] **Open redirect:** `/login?redirect=https://malicioso.example` NO lleva a ese dominio
      (`safeRedirect` en `src/lib/redirect.ts` rechaza `//host`, `\\` y URLs absolutas).
- [ ] Con Atlas caído y una cookie de sesión presente, `/admin` responde 302 a `/login`, NO 500.
- [ ] Logout borra la cookie y `/admin` vuelve a redirigir.
- [ ] Email duplicado en registro → error controlado en español, sin 500.
- [ ] Password de 9 chars → rechazada por Zod antes de llegar a Better Auth.
- [ ] Con `ALLOW_PUBLIC_SIGNUP=false`, `/registro` → 404 y el POST directo con `curl` → 403.

---

## TANDA 5 — Shell del Dashboard

**Objetivo:** `/admin` navegable, protegido, con layout propio. Sin edición todavía.

### 5.1 `AdminLayout.astro`

- `export const prerender = false` en las páginas que lo usan (el layout no lo declara).
- `<meta name="robots" content="noindex,nofollow">`.
- Sidebar: **Contenido** (`/admin`), **Usuarios** (`/admin/usuarios`).
- Topbar: nombre del usuario (`Astro.locals.user.name`), `ThemeToggle`, botón "Cerrar sesión".
- Slot `header` para acciones contextuales de cada página.
- Recibe `Astro.locals.user` como prop explícita, no lo lee del contexto global en el layout.

### 5.2 `/admin/index.astro` — índice de secciones

`listSectionsMeta()` devuelve `{ ok, error, sections }`, no solo un array.

> **El dashboard NO cae al contenido semilla en silencio, a diferencia de la landing.** Un editor
> tiene que saber si la base no responde: si guardara creyendo que todo va bien, perdería el
> cambio. Con `ok: false` la página muestra `DbErrorBanner` (rol `alert`, causa visible y aviso
> explícito de no editar) y **sigue renderizando la lista** de las 11 secciones con metadata
> vacía, en lugar de devolver un 500.

Tabla/grid desde `listSectionsMeta()`:

| Sección | Última edición | Editor | Acción |
|---|---|---|---|
| Hero | hace 2 h | Daniel Vásquez | Editar → |

- Orden fijo según `SECTION_KEYS` (el orden visual de la landing).
- Fechas con `Intl.DateTimeFormat('es-MX', { dateStyle:'medium', timeStyle:'short', timeZone:'America/Mexico_City' })`,
  centralizado en `src/lib/dates.ts`. **Formatear en el servidor**, no en el cliente: evita el
  hydration mismatch, y la zona se fija explícitamente porque las funciones de Vercel corren en
  UTC (un cambio guardado a las 23:30 de CDMX se mostraría con la fecha del día siguiente).
- Banner superior: `DeployStatus.astro`, placeholder estático en esta Tanda; la Tanda 7 lo
  convierte en island de React con estado real y polling acotado.
- **Logout en vanilla, no en React:** `POST /api/auth/sign-out` devuelve JSON 200, así que un
  `<form method="post">` plano navegaría a la respuesta y mostraría el JSON crudo. Hace falta
  fetch + redirección manual, y para eso no se justifica cargar React.
- Tabla en pantallas anchas, lista de tarjetas en móvil: una tabla de 4 columnas con scroll
  horizontal en un teléfono es inutilizable para esta información.

### 5.3 Criterios de aceptación Tanda 5

- [ ] `/admin` lista las 11 secciones con su metadata real desde Mongo.
- [ ] Sidebar marca el item activo (`aria-current="page"`).
- [ ] "Cerrar sesión" funciona y redirige a `/login`.
- [ ] El dashboard respeta el tema Light/Dark con los mismos tokens que la landing.
- [ ] `curl -I https://<dominio>/admin` sin cookie → 302.

---

## TANDA 6 — Edición de contenido (Astro Actions + React)

**Objetivo:** editar y guardar cada sección con validación end-to-end tipada.

### 6.1 Por qué Astro Actions y no API routes

Astro Actions dan: validación Zod en el borde, tipos compartidos cliente↔servidor sin
duplicación, manejo de errores estructurado (`isInputError`), y llamada desde React con
`actions.content.updateSection(...)` sin escribir `fetch`. Menos superficie de bugs que
11 endpoints REST a mano.

### 6.2 `src/actions/index.ts`

```ts
import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';  // `astro:schema` está deprecado (se elimina en Astro 8)
import { SECTION_SCHEMAS, SECTION_KEYS } from '../lib/content/schemas';
import { setSection } from '../lib/content/repository';
import { triggerDeploy, getDeployState } from '../lib/deploy';

function requireUser(locals: App.Locals) {
  if (!locals.user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Sesión requerida' });
  return locals.user;
}

export const server = {
  content: {
    updateSection: defineAction({
      accept: 'json',
      input: z.object({
        key: z.enum(SECTION_KEYS as [string, ...string[]]),
        data: z.unknown(),
      }),
      handler: async ({ key, data }, ctx) => {
        const user = requireUser(ctx.locals);

        // Segunda validación: el schema específico de la sección.
        // z.unknown() en el input es intencional — el discriminante es `key`.
        const schema = SECTION_SCHEMAS[key as keyof typeof SECTION_SCHEMAS];
        const parsed = schema.safeParse(data);
        if (!parsed.success) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' · '),
          });
        }

        await setSection(key as any, parsed.data as any, user);   // escribe + audita
        const deploy = await triggerDeploy({ reason: `content:${key}`, actor: user });

        return { ok: true as const, savedAt: new Date().toISOString(), deploy };
      },
    }),
  },
  deploy: {
    state:   defineAction({ handler: async (_i, ctx) => { requireUser(ctx.locals); return getDeployState(); } }),
    trigger: defineAction({
      handler: async (_i, ctx) => {
        const user = requireUser(ctx.locals);
        return triggerDeploy({ reason: 'manual', actor: user, force: true });
      },
    }),
  },
};
```

> **Nota crítica:** el guardado **no** debe fallar si el webhook falla. `triggerDeploy` captura
> su propio error y lo devuelve como `{ ok:false, error }`. El contenido ya está en Mongo; el
> deploy es reintentable desde el botón manual.

### 6.3 `/admin/contenido/[key].astro`

```astro
---
export const prerender = false;
const { key } = Astro.params;
if (!SECTION_KEYS.includes(key as SectionKey)) return Astro.redirect('/admin', 302);
const data = await getSection(key as SectionKey);
---
<AdminLayout user={Astro.locals.user!} title={SECTION_LABELS[key]}>
  <SectionEditor client:load sectionKey={key} initialData={data} />
</AdminLayout>
```

### 6.4 `SectionEditor.tsx` — arquitectura del formulario

No usar librería de formularios. Estado local con `useReducer` sobre una copia profunda de
`initialData`.

Renderizador dirigido por un **descriptor de campos** (`src/components/admin/fieldMap.ts`),
no por introspección del Zod schema (fragil y verboso):

```ts
type Field =
  | { kind: 'text';     path: string; label: string; max?: number }
  | { kind: 'textarea'; path: string; label: string; max?: number; rows?: number }
  | { kind: 'url';      path: string; label: string }
  | { kind: 'list';     path: string; label: string; itemLabel: string; max: number }      // string[]
  | { kind: 'repeater'; path: string; label: string; max: number; fields: Field[] };       // object[]

export const FIELD_MAP: Record<SectionKey, Field[]> = { /* 11 entradas */ };
```

Rutas punteadas (`cta.label`, `estudios.0.nombre`) con `getPath`/`setPath` inmutables en
`paths.ts`: evita escribir un reducer a medida para cada una de las 11 secciones.

Componentes:
- `RepeaterField.tsx`: agregar / eliminar / mover ↑↓ items. Botones con `aria-label` explícito
  que incluye el título del item — "↑" no dice nada a un lector de pantalla.
- Contador de caracteres visible cuando hay `max` (ej. `seo.description` 50–160).
- Botón **Guardar** deshabilitado si `!isDirty`. `beforeunload` si hay cambios sin guardar.
- Al guardar: `actions.content.updateSection({ key, data })`.
  - Éxito → se adopta lo enviado como nueva línea base (`setPristine`), `isDirty` pasa a false
    y aparece un toast. **NUNCA `window.location.reload()`** — ver el aviso de abajo.

> **Trampa verificada: `reload()` tras guardar dispara el diálogo nativo del navegador**
> ("Reload site? Changes you made may not be saved").
>
> Si `pristine` es un `useMemo` sobre `initialData`, tras un guardado exitoso sigue siendo el
> dato original, así que `isDirty` sigue en `true` y el listener `beforeunload` sigue montado.
> La recarga lo dispara y el usuario ve una alerta de pérdida de datos… cuando los datos ya
> estaban guardados. Además obliga a recargar a mano para ver los cambios.
>
> Solución: `pristine` es **estado**, y al confirmar el servidor se asigna la instantánea de lo
> enviado. `isDirty` pasa a false, el guard se desmonta, y los campos ya muestran los valores
> guardados porque `data` nunca se descartó. Sin recargas.

> **El mensaje del toast debe reflejar el resultado real del webhook.** "La landing se está
> actualizando" solo es cierto si el redespliegue se disparó. Con el hook sin configurar, dentro
> del enfriamiento, o si el hook falló, esa frase haría esperar al editor un cambio en la web
> pública que no va a llegar. `describeDeploy()` mapea los cuatro casos de `DeployResult` a
> mensajes distintos.
  - `isInputError(error)` → pintar errores por campo.
  - `ActionError` `BAD_REQUEST` → banner con el mensaje agregado de Zod.
  - `UNAUTHORIZED` → redirect a `/login`.

### 6.5 Criterios de aceptación Tanda 6

- [ ] Editar `hero.headline`, guardar, recargar la página → el valor persiste.
- [ ] Verificar en Atlas que `landing_sections.hero.data.headline` cambió y `updatedBy` tiene el usuario correcto.
- [ ] Enviar `seo.description` de 20 chars → error de validación en el campo, **nada se escribe en Mongo**.
- [ ] Agregar un 7.º estudio en el repeater, guardar, rebuild → aparece en la landing.
- [ ] `curl -X POST /_actions/content.updateSection` sin cookie → 401 (no 500, no 200).
- [ ] Clave de sección inexistente → 400 (`AstroActionInputError`, atrapado por el `z.enum`).
- [ ] `seo.title` de 95 caracteres → 400 con el mensaje del campo; la base NO se modifica.
- [ ] Borrar la cookie en DevTools y guardar → redirige a login sin perder pantalla en blanco.

---

## TANDA 7 — Deploy Webhook de Vercel (el requisito core)

**Objetivo:** cada guardado dispara un rebuild, sin saturar la cuota de builds.

### 7.1 El problema que hay que resolver

Un editor guardando 6 secciones seguidas dispararía 6 builds. Cada build de Vercel toma
~40–90 s y consume cuota. Peor: builds concurrentes pueden completar fuera de orden y publicar
contenido viejo.

**Solución: debounce con ventana de enfriamiento + flag `pending`.**

```
save() → ¿pasaron > COOLDOWN seg desde lastTriggeredAt?
          ├── SÍ  → POST al hook, lastTriggeredAt = now, pending = false
          └── NO  → pending = true, NO se dispara.
                    Un cron (o el siguiente save pasado el cooldown) lo drena.
```

### 7.2 `src/lib/deploy.ts`

```ts
type DeployResult =
  | { ok: true;  triggered: true;  at: string }
  | { ok: true;  triggered: false; reason: 'cooldown' | 'disabled'; nextEligibleAt?: string }
  | { ok: false; error: string };

export async function triggerDeploy(opts: {
  reason: string;
  actor: { id: string; name: string };
  force?: boolean;
}): Promise<DeployResult>;

export async function getDeployState(): Promise<{
  lastTriggeredAt: string | null;
  pending: boolean;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  cooldownSeconds: number;
  nextEligibleAt: string | null;
}>;
```

Implementación de `triggerDeploy`:

1. Si `!VERCEL_DEPLOY_HOOK_URL` → `{ ok:true, triggered:false, reason:'disabled' }`.
   (Permite desarrollo local sin disparar builds reales. **No lanzar error.**)
2. **Claim atómico del turno** — evita que dos guardados simultáneos disparen dos builds:
   ```ts
   const cutoff = new Date(Date.now() - COOLDOWN_MS);
   const claim = await collections.meta.findOneAndUpdate(
     { _id: 'deploy_state', $or: [
         { lastTriggeredAt: { $lte: cutoff } },
         { lastTriggeredAt: { $exists: false } },
       ] },
     { $set: { lastTriggeredAt: new Date(), pending: false }, $inc: { triggerCount: 1 } },
     { upsert: true, returnDocument: 'after' }
   );
   if (!claim && !force) {
     await collections.meta.updateOne({ _id: 'deploy_state' }, { $set: { pending: true } });
     return { ok: true, triggered: false, reason: 'cooldown', nextEligibleAt: ... };
   }
   ```
   El filtro condicional en el `findOneAndUpdate` hace el chequeo y la reserva en **una sola
   operación atómica de MongoDB**. Un `find` seguido de un `update` sería una race condition.
3. `POST` al hook con `AbortSignal.timeout(8000)`, body JSON `{ reason, actor: actor.name }`.
   (El body es opcional para Vercel; sirve de rastro en el log del hook.)
4. Persistir `lastStatus` y `lastError`. **Al tener éxito NO se vuelve a tocar `pending`.**

   > **Segunda race condition, encontrada por la prueba de ráfaga:** el claim ya dejó
   > `pending: false`. Entre el claim y la respuesta del hook, un guardado concurrente puede
   > haberlo puesto en `true`. Volver a ponerlo en `false` en la ruta de éxito borra esa marca —
   > y el build arranca al llamar al hook, así que los guardados que aún no habían llegado a
   > MongoDB **no entran en esa compilación** y se quedarían sin publicar para siempre.
5. **Nunca propagar la excepción.** `try/catch` → `{ ok:false, error: String(e) }`.

Constantes:
```ts
const COOLDOWN_MS = Number(import.meta.env.DEPLOY_HOOK_COOLDOWN_SECONDS ?? 90) * 1000;
```

### 7.3 Creación del hook en Vercel

`Project → Settings → Git → Deploy Hooks` → nombre `cms-content-update`, branch `main`.
Resultado: `https://api.vercel.com/v1/integrations/deploy/prj_XXX/YYY`.

> **Este URL es un secreto de facto:** cualquiera que lo tenga puede disparar builds ilimitados
> (DoS de cuota). Va **solo** en `VERCEL_DEPLOY_HOOK_URL` como env var server-side.
> **Prohibido** el prefijo `PUBLIC_` — eso lo inyectaría en el bundle del navegador.

### 7.4 `DeployStatus.tsx` (island en `/admin`)

- Al montar, y cada 20 s mientras `pending || justTriggered`, llama `actions.deploy.state()`.
- Estados visibles:
  - `Publicado · última actualización hace N min`
  - `Redespliegue en curso…` (spinner, dentro de los primeros 120 s del trigger)
  - `Cambios pendientes de publicar · disponible en Ns` + botón **Publicar ahora** (usa
    `deploy.trigger` con `force:true`)
  - `Error al disparar el redespliegue: <msg>` + botón **Reintentar**
- **Detener el polling** cuando no hay nada pendiente. Un `setInterval` eterno en una pestaña
  abierta toda la tarde son miles de invocaciones serverless innecesarias.

### 7.5 Drenaje de `pending` (opcional, recomendado)

Si un editor guarda y cierra el navegador dentro del cooldown, `pending` queda `true` y el
cambio no se publica. Dos opciones:

- **A (simple):** el `DeployStatus` muestra el pendiente y el siguiente save/click lo drena.
  Riesgo real de contenido no publicado.
- **B (implementada, doble vía):**
  1. `DeployStatus.tsx` detecta `pending` con el enfriamiento ya vencido y llama
     `deploy.drain` por sí solo: con el dashboard abierto, se publica sin intervención.
     Se prefirió esto a que `getDeployState()` dispare por sí mismo — una función llamada
     "get" no debe tener efectos secundarios.
  2. `src/pages/api/cron/drain-deploy.ts` (`prerender = false`),
  protegido por header `Authorization: Bearer ${CRON_SECRET}`, que si `pending===true` y pasó
  el cooldown, dispara. Registrado en `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/drain-deploy", "schedule": "*/10 * * * *" }] }
  ```
  Vercel envía el header `Authorization: Bearer <CRON_SECRET>` automáticamente si la var existe.
  **NO está registrado en `vercel.json` a propósito:** `*/10` requiere plan Pro, y un cron diario
  (lo máximo en Hobby) dejaría un cambio sin publicar hasta 24 h, que es peor que no tenerlo.
  Sin `CRON_SECRET` el endpoint responde 503: abierto permitiría a cualquiera agotar la cuota
  de builds.

### 7.6 Criterios de aceptación Tanda 7

- [ ] Guardar una sección en producción → aparece un deployment nuevo en el dashboard de Vercel dentro de 10 s.
- [ ] Al terminar el build, `/` sirve el contenido nuevo (hard refresh).
- [ ] Guardar 3 secciones en 30 s → **un solo** deployment, y `deploy_state.pending === true`.
- [ ] Esperar el cooldown y guardar de nuevo → segundo deployment.
- [ ] Con `VERCEL_DEPLOY_HOOK_URL` vacía en local, guardar funciona y devuelve `reason:'disabled'`.
- [ ] Apuntar la var a un URL inválido → el guardado **sigue siendo exitoso** y la UI muestra el error del deploy.
- [ ] `grep -r "api.vercel.com/v1/integrations" dist/` → **sin resultados** (el secreto no se filtró al cliente).

---

## TANDA 8 — Auditoría: último autor de cambios y `/admin/usuarios`

**Objetivo:** módulo de usuarios que muestre únicamente quién hizo el último cambio.

### 8.1 `src/lib/audit.ts`

```ts
export async function recordChange(input: {
  userId: string; name: string; email: string; sectionKey: SectionKey;
}): Promise<void> {
  await collections.meta.updateOne(
    { _id: 'last_change' },
    { $set: { ...input, at: new Date() } },
    { upsert: true },
  );
}

export async function getLastChange(): Promise<{
  userId: string; name: string; email: string; sectionKey: SectionKey; at: Date;
} | null>;
```

Se invoca desde `setSection()` (repositorio), **no** desde la action. Así cualquier ruta de
escritura futura (un script, un import masivo, otra action) queda auditada por construcción y
no por acordarse de llamarla.

> **Nota sobre atomicidad:** `setSection` escribe en 2 colecciones (`landing_sections` y
> `app_meta`). MongoDB no las hace atómicas sin transacción. Es aceptable aquí: si la segunda
> falla, el contenido se guardó y solo el registro de "último autor" quedó viejo — impacto nulo.
> **No introducir una transacción** por esto (requiere replica set y añade latencia).
> Orden: primero el contenido, después la auditoría.

### 8.2 `/admin/usuarios.astro`

```astro
---
export const prerender = false;
const last = await getLastChange();
const totalUsers = await collections.users.countDocuments();
---
```

Contenido de la vista, ajustado al alcance solicitado (**solo el autor, sin log de cambios**):

1. **Card principal — "Último cambio en la web"**
   - Avatar con iniciales derivadas de `name`.
   - Nombre (`name`, tomado del registro de la cuenta ✓).
   - Correo, en texto secundario.
   - Fecha/hora absoluta (`es-MX`, `America/Mexico_City`) + relativa (`Intl.RelativeTimeFormat`).
   - Sección tocada (`SECTION_LABELS[sectionKey]`) — dato gratuito, no es un log.
   - Estado vacío: "Aún no se han registrado cambios en el contenido."
2. **Card secundaria — "Cuentas con acceso"**: `totalUsers` y una lista de solo lectura
   (`name`, `email`, `createdAt`). Justificación: sin ella la página tiene un solo dato y
   "Módulo de Usuarios" queda vacío de sentido. **Sin edición ni borrado** — fuera de alcance.
3. Indicador del estado de altas: "Registro público: activo / cerrado" según `ALLOW_PUBLIC_SIGNUP`.
   Evita dejar el registro abierto por olvido.

Proyección explícita **con `_id: 0`**: `find({}, { projection: { _id: 0, name:1, email:1, createdAt:1 } })`.

> Enumerar los campos deseados NO basta: MongoDB incluye `_id` por defecto salvo que se excluya.
> Sin `_id: 0`, el ObjectId de cada cuenta acabaría en el HTML servido. No es una credencial,
> pero es un identificador interno que la vista no necesita.

### 8.3 Criterios de aceptación Tanda 8

- [ ] Usuario A guarda el Hero → `/admin/usuarios` muestra "A", la hora correcta y "Hero".
- [ ] Usuario B guarda FAQ → la card muestra a B (reemplaza a A, no acumula).
- [ ] Base sin cambios registrados → estado vacío, sin excepción.
- [ ] La lista de cuentas no expone `password`, `providerId` ni `_id` en el HTML servido.
- [ ] Zona horaria correcta: guardar a las 23:30 CDMX no muestra la fecha del día siguiente.
- [ ] Con MongoDB caído y sesión en el `cookieCache`, la página responde 200 con el banner de
      error en lugar de un 500. (Propiedad emergente del `cookieCache` de 5 min: la sesión se
      valida sin tocar la base, así que el panel degrada en vez de caerse.)
- [ ] `app_meta` sigue teniendo UN documento `last_change`, no una colección que crece.

---

## TANDA 9 — Hardening, accesibilidad y performance

### 9.1 Seguridad

- **Headers** en `vercel.json`:
  ```
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; img-src 'self' data: https:;
    style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';
    connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  ```
  > `'unsafe-inline'` en `script-src` es necesario por el script de tema `is:inline` y la
  > hidratación de Astro. Endurecer con hashes es posible pero rompe en cada build; si se
  > requiere CSP estricta, migrar el script de tema a un archivo con nonce por request —
  > **incompatible con SSG** en `/`. Se acepta `'unsafe-inline'` documentando el trade-off.
- Rate limiting en `/api/auth/sign-in`: Better Auth trae `rateLimit` interno →
  `rateLimit: { enabled: true, window: 60, max: 10, storage: 'database' }`.
  `storage:'database'` es obligatorio en serverless (la memoria no se comparte entre instancias).
- Password mínima 10 chars (Tanda 4). No exigir símbolos: reduce entropía real al empujar
  patrones predecibles.
- `.env` en `.gitignore`. Verificar con `git check-ignore -v .env`.
- Auditar que ninguna var sin prefijo `PUBLIC_` aparezca en `dist/_astro/*.js`.

### 9.2 Accesibilidad (objetivo: WCAG 2.2 AA)

- Skip link `<a href="#contenido" class="sr-only focus:not-sr-only">` como primer elemento del body.
- Contraste: auditar los 9 tokens en ambos temas. `#0d9488` **solo** como fondo de botón.
- `MobileNav`: focus trap, cierre con `Escape`, `aria-expanded`, `aria-controls`, restauración
  de foco al botón al cerrar, `inert` en el contenido de fondo.
- Formularios del admin: `<label for>` real en cada campo (no placeholder como label),
  `aria-invalid` + `aria-describedby` apuntando al mensaje de error, `role="alert"` en el resumen.
- Toasts: `role="status"` `aria-live="polite"`. Errores: `role="alert"` `aria-live="assertive"`.
- Verificar navegación completa del dashboard con solo teclado.

### 9.3 Performance

- **Fuentes: NINGUNA fuente web (decisión revisada en Tanda 9).** El plan pedía autoalojar
  Inter; se descartó por dos motivos:
  1. Nombrar `"Inter"` en el stack sin servir el archivo es **peor** que no nombrarla: quien la
     tenga instalada la ve y quien no ve `system-ui`, así que el diseño se renderiza distinto
     según la máquina del visitante. (Ese era el estado real hasta la Tanda 9.)
  2. Servirla cuesta ~50-70 KB sobre el cable (subset latin, pesos 400 y 700) más riesgo de
     FOUT. El JS total de la landing es **1.97 KB**: la fuente sería 25× todo lo demás, en un
     proyecto cuyo requisito explícito es la máxima velocidad, y el cliente no pidió ninguna
     tipografía de marca.

  Se usa el stack del sistema: 0 bytes, pinta en el primer frame. Si más adelante se define una
  tipografía de marca, autoalojarla con `font-display: swap` y preload del peso 400.
- **Imágenes:** `<Image />` de `astro:assets` para todo lo local. AVIF con fallback WebP.
  `width`/`height` siempre. La imagen del hero con `loading="eager"` `fetchpriority="high"`;
  el resto `lazy`.
- Presupuesto de bundle: **≤ 60 KB gzip de JS en `/`**. **Ya resuelto en Tanda 1:** el
  presupuesto se excedía (72 KB) solo por el runtime de React DOM, así que `ThemeToggle` y
  `MobileNav` se reescribieron en vanilla. Medición actual de `/`: **1.97 KB gzip**
  (1.12 KB del runtime de Astro + 3 scripts inline de ~280 B). React queda solo en `/admin`.
  Mantener esta medición como test de regresión al agregar las secciones de la Tanda 3.
- `@astrojs/sitemap` con `filter: (page) => !page.includes('/admin') && !page.includes('/api')`.

### 9.4 Criterios de aceptación Tanda 9

- [ ] securityheaders.com → grado A o superior.
- [ ] `npm run a11y:contrast` → sin fallos AA en ambos temas (14 combinaciones × 2).
- [ ] `npm run a11y:html` → 15/15 comprobaciones estructurales sobre el HTML generado.
- [ ] `axe DevTools` en `/` y en `/admin/contenido/hero`: 0 violaciones críticas o serias.
      (Los dos scripts anteriores cubren lo mecánico; axe y la prueba con teclado siguen siendo
      necesarios y **pendientes de ejecución manual**.)
- [ ] Lighthouse mobile en `/` (producción): Performance ≥ 95, A11y 100, Best Practices ≥ 95, SEO 100.
- [ ] Login: el **4.º** intento en 10 s devuelve 429 con `x-retry-after`.
      (Better Auth aplica reglas propias más estrictas a `/sign-in` y `/sign-up`: **3 por 10 s**,
      no el `max: 10` de la config, que rige para el resto de endpoints. Verificado en el código
      del paquete y en ejecución.)
- [ ] Navegar y editar una sección completa usando solo teclado.

---

## TANDA 10 — Deploy a producción y QA end-to-end

### 10.1 Variables de entorno en Vercel

Cargar todas las de `.env.example`. Scoping por entorno:

| Var | Production | Preview | Development |
|---|---|---|---|
| `MONGODB_URI` | cluster prod | cluster prod (o `..._preview`) | local/Atlas dev |
| `MONGODB_DB_NAME` | `laboratorio` | `laboratorio_preview` | `laboratorio_dev` |
| `BETTER_AUTH_SECRET` | secreto A | secreto A | cualquiera |
| `BETTER_AUTH_URL` | `https://<subdominio>` | **`$VERCEL_URL`** | `http://localhost:4321` |
| `PUBLIC_SITE_URL` | `https://<subdominio>` | `$VERCEL_URL` | `http://localhost:4321` |
| `VERCEL_DEPLOY_HOOK_URL` | hook real | **vacía** | vacía |
| `ALLOW_PUBLIC_SIGNUP` | `false` (tras crear cuentas) | `true` | `true` |
| `CLOUDINARY_CLOUD_NAME` | el de la cuenta | el mismo | el mismo |
| `CLOUDINARY_API_KEY` | la clave | la misma | la misma |
| `CLOUDINARY_API_SECRET` | el secreto | el mismo | el mismo |
| `CLOUDINARY_FOLDER` | `landing-laboratorio` | `landing-laboratorio` | `landing-laboratorio` |

> **`VERCEL_DEPLOY_HOOK_URL` vacía en Preview es obligatorio.** El hook apunta a `main`:
> si un preview de una rama lo dispara, publica producción desde otra rama. Bug silencioso y grave.

> **`BETTER_AUTH_URL` en Preview:** los dominios de preview son aleatorios. Usar
> `https://${VERCEL_URL}` resuelto en `astro.config.mjs`/`auth.ts`, o aceptar que el login no
> funcione en previews (aceptable si el QA de auth se hace en producción).

### 10.2 Dominio

Subdominio ya configurado → asignarlo al proyecto, verificar SSL activo, y confirmar que
`PUBLIC_SITE_URL` / `BETTER_AUTH_URL` coinciden **exactamente** (con `https://`, **sin** slash final).
Un mismatch rompe `trustedOrigins` y las cookies de sesión.

### 10.2.1 Preflight automatizado

`npm run preflight` (o `-- --prod`) verifica lo que un build verde NO garantiza.
Detecta los 8 fallos de configuración que cuestan más tiempo:

| Detecta | Por qué importa |
|---|---|
| Variables obligatorias ausentes | El build muere o cae al semilla |
| Comillas en los valores | `Invalid URL` sin decir qué variable |
| `PUBLIC_SITE_URL` ≠ `BETTER_AUTH_URL` | Login en bucle, sin mensaje útil |
| `http://` en producción | Cookies sin `Secure` |
| Secreto corto o el de ejemplo | Sesiones falsificables |
| Prefijo `PUBLIC_` en un secreto | El secreto llega al navegador |
| `ALLOW_PUBLIC_SIGNUP=true` en prod | Cualquiera edita la web |
| Hook definido en Preview | Un preview publica producción |

Además comprueba contra Atlas: conexión, índices, que las 11 secciones existan y
validen, y que haya al menos una cuenta.

### 10.3 Orden de puesta en marcha

```
1. Crear cluster Atlas + usuario + 0.0.0.0/0
2. npm run db:indexes
3. npm run db:seed
4. Cargar env vars en Vercel (ALLOW_PUBLIC_SIGNUP=true, sin DEPLOY_HOOK aún)
5. Deploy → verificar que / renderiza el contenido del seed
6. Registrar las cuentas del equipo en /registro
7. ALLOW_PUBLIC_SIGNUP=false
8. Crear el Deploy Hook y cargar VERCEL_DEPLOY_HOOK_URL (solo Production)
9. Redeploy
10. QA (10.4)
```

> El paso 8 va **después** del primer deploy exitoso: el hook no puede existir antes del proyecto.

### 10.4 Checklist de QA en producción

- [ ] `/` carga < 1.5 s LCP en 4G simulado, contenido correcto.
- [ ] View-source de `/` muestra todos los textos (confirma SSG real, no hidratación).
- [ ] Toggle de tema funciona en `/` y en `/admin`, persiste, sin FOUC.
- [ ] Registro bloqueado (`/registro` → 404).
- [ ] Login con credenciales válidas → `/admin`. Con inválidas → mensaje genérico.
- [ ] Editar el headline del hero → guardar → deployment en Vercel → tras el build, `/` muestra el nuevo texto.
- [ ] `/admin/usuarios` muestra al autor correcto del cambio anterior.
- [ ] 3 guardados rápidos → 1 solo build + estado "pendiente" visible en la UI.
- [ ] Cerrar sesión → `/admin` inaccesible.
- [ ] `grep` del bundle de producción: sin `MONGODB_URI`, sin `BETTER_AUTH_SECRET`, sin URL de hook.
- [ ] Móvil real (iOS Safari + Android Chrome): nav, acordeones FAQ, tap targets ≥ 44px.

---

---

## TANDA 11 — Gestión de imágenes con Cloudinary

**Objetivo:** que el administrador pueda **reemplazar** las imágenes de la landing desde el
panel, sin poder alterar cuántas hay ni dónde van, y que el cambio se publique por el mismo
mecanismo de redespliegue de la Tanda 7.

### 11.0 La decisión que hace cumplible el requisito

El requisito «solo reemplazar, nunca añadir» no se puede garantizar con una restricción de UI:
ocultar un botón no impide un POST directo a la action, y la Tanda 6 ya demostró que las actions
son endpoints alcanzables con `curl`.

**Las ranuras (slots) se declaran en CÓDIGO, no en datos.**

```
src/lib/images/slots.ts   →  registro cerrado de slots válidos (fuente de verdad)
landing_images            →  colección en MongoDB: una fila POR slot existente
```

La API de subida rechaza cualquier `slotId` que no esté en el registro. Consecuencias:

- **Añadir una imagen es imposible sin un despliegue de código.** No es una convención de la
  interfaz: es estructural.
- El layout no puede cambiar desde el panel, porque el número de ranuras no es un dato editable.
- Un bug o una escritura directa en la base tampoco pueden crear una ranura: la landing solo
  renderiza slots que existen en el registro.

> **RESUELTO (cambio de requisito del cliente).** La regla pasó a ser: las secciones de imagen
> ÚNICA siguen siendo fijas (`hero`, `deteccion-oportuna`, `cta-final`, `faq-fondo`), pero los
> grids cuyas tarjetas llevan imagen **sí** ganan una ranura al añadir una tarjeta.
>
> Implementación: cada tarjeta lleva un `imageKey` inmutable que asigna y conserva el SERVIDOR;
> su fila vive en `landing_images/<path>:<imageKey>`. Qué repeaters tienen imagen sigue
> declarándose en código (`src/lib/images/cards.ts`), así que añadir imágenes a los testimonios
> o al acordeón exige un despliegue — lo que crece es el número de tarjetas, no el de secciones
> con imagen.
>
> **El aviso al renombrar dejó de tener sentido y NO se implementó.** Con emparejamiento por
> `imageKey`, renombrar una tarjeta conserva su imagen (verificado). El riesgo real pasa a ser
> **eliminar** la tarjeta, y ahí sí se pide confirmación, indicando qué se pierde.
>
> El texto de abajo describe el diseño ANTERIOR, previo a este cambio.

> **Tensión con la Tanda 6 (histórico).** Hoy el panel permite **añadir y quitar items**
> en 6 repeaters (estudios, categorías, beneficios, testimonios, videos, preguntas). Si las
> imágenes vivieran dentro de cada item del repeater, agregar un estudio crearía una ranura nueva
> y alteraría el layout — exactamente lo que este requisito prohíbe.
>
> **Resolución adoptada:** las imágenes NO viven dentro de los repeaters. Viven en
> `landing_images`, indexadas por `slotId` del registro. Un repeater y su slot se emparejan por
> índice a través del registro.
>
> **Consecuencia que el cliente debe aceptar:** si añade un 7.º estudio desde el panel, esa
> tarjeta **no tendrá imagen** hasta que se agregue su slot en código. Es el precio de que el
> layout sea inalterable desde el panel. La alternativa (imágenes dentro del repeater) haría el
> requisito incumplible.

### 11.1 Registro de slots

`src/lib/images/slots.ts`:

```ts
export type ImageSlot = {
  /** Id estable usado en código, en el panel y como `_id` en `landing_images`. */
  id: string;
  /**
   * `public_id` REAL en Cloudinary. Se declara explícitamente en lugar de
   * derivarlo de `id` porque los assets ya existen con nombres en español y con
   * acentos. Derivarlo haría que el primer reemplazo subiera a un `public_id`
   * distinto del actual y dejara el original huérfano.
   */
  publicId: string;
  section: SectionKey;
  /** Etiqueta del panel: nombra la tarjeta o el bloque concreto. */
  label: string;
  /** Cómo se integra en el layout. Determina el componente que la renderiza. */
  placement: 'aside-right' | 'card-top' | 'section-background';
  aspect: '4/3' | '16/9';
  /** Ancho máximo al que se muestra, base del srcset. */
  displayWidth: number;
};
```

**Las 10 ranuras, con los `public_id` verificados contra la cuenta** (`asset_folder =
"landing-laboratorio"`, cloud `jlpjcazy`):

| `id` | `publicId` en Cloudinary | Sección | Ubicación | Origen |
|---|---|---|---|---|
| `hero` | `hero` | `hero` | Lado derecho | 1200×896 webp |
| `estudio-biometria-hematica` | `Biometría_Hemática` | `estudios_principales` | Tarjeta | 1376×768 webp |
| `estudio-quimica-sanguinea` | `Química_Sanguínea` | `estudios_principales` | Tarjeta | 1376×768 webp |
| `estudio-examen-orina` | `Examen_General_de_Orina` | `estudios_principales` | Tarjeta | 1376×768 webp |
| `estudio-hemoglobina-glucosilada` | `Hemoglobina_Glucosilada` | `estudios_principales` | Tarjeta | 1376×768 webp |
| `estudio-perfil-lipidos` | `Perfil_de_Lípidos` | `estudios_principales` | Tarjeta | 1376×768 webp |
| `estudio-perfil-tiroideo` | `Perfil_Tiroideo` | `estudios_principales` | Tarjeta | 1376×768 webp |
| `deteccion-oportuna` | `Detección_Oportuna` | `por_que_estudios` | Lado derecho | 1376×768 webp |
| `cta-final` | `Tu_salud_no_puede_esperar` | `cta_final` | Lado derecho | **PENDIENTE de subir** |
| `faq-fondo` | `Preguntas_Frecuentes` | `faq` | Fondo de sección | 1376×768 webp |

> **`cta-final` no tiene asset todavía.** Verificado con la Admin API: la carpeta contiene 9
> imágenes y falta la de «Tu salud no puede esperar». La sección renderiza su placeholder hasta
> que se suba, así que no bloquea nada — pero la ubicación queda vacía.

> **Las miniaturas de Instagram (`video-1`…`video-7`) salen del registro.** No están en la
> carpeta y no se mencionan en la especificación de ubicaciones. `Videos.astro` conserva su
> placeholder actual. Si más adelante se quieren gestionar por Cloudinary, se añaden 7 slots.

#### 11.1.1 Cuenta con carpetas dinámicas: el `public_id` NO lleva el prefijo

Verificado contra la cuenta: los assets tienen `asset_folder = "landing-laboratorio"` pero su
`public_id` es `hero`, **no** `landing-laboratorio/hero`. Es el modo de *dynamic folders* de
Cloudinary, donde la carpeta es metadato y no parte del identificador.

Consecuencias para la implementación:

- **Al subir hay que pasar `asset_folder: CLOUDINARY_FOLDER` explícitamente.** Sin él, el
  reemplazo aterrizaría en la raíz de la cuenta y el asset de la carpeta quedaría intacto.
- El `public_id` del reemplazo es el de la tabla, **sin prefijo**.
- Los `public_id` llevan acentos y mayúsculas. Hay que normalizarlos a **NFC** antes de compararlos
  o enviarlos: la misma cadena en NFD (como la produce macOS al copiar de Finder) es un
  identificador distinto para Cloudinary y crearía un asset duplicado.
- En la URL de entrega van percent-encoded. La función de construcción de URL debe aplicar
  `encodeURIComponent` a cada segmento del `public_id`.

#### 11.1.2 Especificación de layout por ubicación

**`aside-right` — Hero, Detección oportuna, Tu salud no puede esperar**

Rejilla de dos columnas en escritorio, apiladas en móvil con el texto primero:

```
lg:  [ texto 55% ] [ imagen 45% ]        base: [ texto ] sobre [ imagen ]
```

- `grid lg:grid-cols-[1.15fr_1fr] lg:items-center gap-10`
- La imagen va en un contenedor con `aspect-ratio` fijo, `rounded-2xl overflow-hidden` y
  `object-cover`.
- **El hero es el LCP.** Su imagen es la única con `loading="eager"` y `fetchpriority="high"`;
  todas las demás van `lazy`.
- En móvil la imagen va **después** del CTA, no entre el texto y el botón: interponerla empujaría
  la conversión por debajo del pliegue.

**`card-top` — los 6 estudios**

La imagen encabeza la tarjeta, a sangre con sus bordes:

- Contenedor `aspect-[16/9] overflow-hidden` como primer hijo de la tarjeta; la tarjeta ya tiene
  `overflow-hidden` y `rounded-xl`, así que la imagen hereda el radio superior.
- `object-cover` y `width`/`height` explícitos: sin ellos, seis imágenes cargando en diferido
  provocan seis saltos de layout.
- Si un estudio **no** tiene slot (porque el administrador añadió una tarjeta nueva desde el
  panel, ver 11.0), la tarjeta se renderiza **sin** el bloque de imagen, no con un hueco vacío.
  El emparejamiento es por `id` de slot, no por posición en el array.

**`section-background` — Preguntas frecuentes**

La imagen va detrás de toda la sección, y aquí hay un riesgo de accesibilidad que debe resolverse
en el diseño, no descubrirse en producción:

> **Texto sobre fotografía destruye el contraste.** La Tanda 9 dejó las 14 combinaciones de color
> en AA medido, y una imagen de fondo lo invalida: el ratio pasa a depender de cada píxel. La FAQ
> lleva texto de cuerpo, que exige 4.5:1.
>
> Mitigación obligatoria, en este orden:
> 1. La imagen se sitúa con `position: absolute; inset: 0; object-fit: cover` y
>    `aria-hidden="true"` — es decorativa, no informativa.
> 2. **Scrim opaco por encima**, no una opacidad sobre la imagen:
>    `bg-[var(--color-surface-muted)]/92` en light y `/94` en dark. Con 92 % de opacidad el color
>    del token domina y los ratios medidos se conservan dentro del margen.
> 3. Las tarjetas del acordeón mantienen su `bg-surface` **opaco**. El fondo se percibe en los
>    márgenes de la sección, no debajo del texto.
> 4. Verificar con `npm run a11y:contrast` que no cambia nada, y comprobar a ojo en ambos temas.
>
> Si el resultado se ve demasiado velado para el gusto del cliente, la salida correcta **no** es
> bajar el scrim: es pedir una imagen de menor contraste o aplicarle un desenfoque de entrega
> (`e_blur:400` en la transformación de Cloudinary), que reduce el detalle sin tocar la
> legibilidad del texto.

### 11.2 Modelo de datos

Colección nueva, **separada de `landing_sections`**: el texto y las imágenes se editan por vías
distintas y tienen ciclos de vida distintos.

```jsonc
// landing_images — un documento por slot; `_id` es el slotId
{
  "_id": "estudio-biometria-hematica",
  "publicId": "landing-laboratorio/estudio-biometria-hematica",
  "version": 1790400000,          // para invalidar caché del CDN al reemplazar
  "width": 1600,
  "height": 1200,
  "format": "webp",
  "bytes": 84213,
  "alt": "Tubo de muestra de sangre en el laboratorio",
  "updatedAt": ISODate,
  "updatedBy": { "userId": "...", "name": "...", "email": "..." }
}
```

**Se guarda `publicId` + `version`, NO la URL completa.** Motivo: una URL almacenada congela las
transformaciones dentro del dato. El día que se cambie el ancho de las tarjetas o se quiera
servir AVIF, habría que migrar 14 documentos. Con el `publicId`, la capa de render decide las
transformaciones y un cambio de diseño no toca la base.

`alt` es **obligatorio** y lo escribe el administrador: la auditoría `npm run a11y:html` exige
que toda `<img>` lo tenga, y una imagen de contexto médico sin texto alternativo es una barrera
real, no un detalle formal.

`width`/`height` vienen de la respuesta de Cloudinary y se guardan para emitirlos en el HTML:
sin ellos el layout salta al cargar (CLS), y la misma auditoría lo verifica.

### 11.3 Variables de entorno

El proyecto usa cuatro variables, **ya configuradas en Vercel** por el cliente:

| Variable | Uso | Expuesta al navegador |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Construir las URLs de entrega | No (se inyecta en el HTML ya renderizado) |
| `CLOUDINARY_API_KEY` | Firmar la subida | **No** |
| `CLOUDINARY_API_SECRET` | Firmar la subida | **No, nunca** |
| `CLOUDINARY_FOLDER` | Carpeta de destino: `landing-laboratorio` | No |

> **Verificado: las cuatro están en el `.env` local** (cloud `jlpjcazy`, carpeta
> `landing-laboratorio`). Pendiente al implementar:
> 1. añadirlas a `.env.example` sin comillas, como el resto;
> 2. añadir su comprobación a `scripts/preflight.mjs` (obligatorias, y que `CLOUDINARY_FOLDER`
>    valga `landing-laboratorio`);
> 3. confirmar que están cargadas también en Vercel — el **build** las necesita para construir
>    las URLs de entrega, no solo el runtime del panel.
>
> Ninguna lleva prefijo `PUBLIC_`. `CLOUDINARY_API_SECRET` en el bundle del navegador permitiría
> a cualquiera subir, transformar y **borrar** los assets de la cuenta.

### 11.4 Subida: estrategia de reemplazo

```
Admin elige archivo
      │
      ▼
[1] Validación en cliente (accept + tamaño)   ← comodidad, NO seguridad
      │
      ▼
[2] Action `images.replace` (servidor)
      ├─ revalida la sesión            (las actions son endpoints POST directos)
      ├─ rechaza slotId fuera del registro
      ├─ valida el tipo por BYTES, no por extensión ni MIME declarado
      ├─ valida el tamaño (máx. 5 MB)
      └─ sube a Cloudinary:
             public_id : `${CLOUDINARY_FOLDER}/${slotId}`   ← DETERMINISTA
             overwrite : true
             invalidate: true
      │
      ▼
[3] `updateOne({_id: slotId}, {$set: {...}}, {upsert: true})` en landing_images
      │
      ▼
[4] `recordChange()`  → alimenta /admin/usuarios (Tanda 8)
      │
      ▼
[5] `triggerDeploy()` → mismo debounce y mismos 4 mensajes de la Tanda 7
```

> **CORREGIDO (ver 11.1.1): el `public_id` no lleva el prefijo de la carpeta.** La cuenta usa
> carpetas dinámicas, así que la carpeta va en `asset_folder` y el `public_id` es el nombre
> desnudo (`hero`, no `landing-laboratorio/hero`). Omitir `asset_folder` subiría el reemplazo a la
> raíz de la cuenta y dejaría intacto el asset de la carpeta.

**`public_id` determinista con `overwrite: true` es la decisión central del reemplazo.** Efectos:

- **No se acumulan huérfanos.** Cada slot tiene un único asset en Cloudinary, para siempre. No
  hace falta un endpoint de borrado — y no tenerlo reduce la superficie de daño.
- **La URL base no cambia**, así que un fallo a mitad del flujo no deja la landing sin imagen:
  sigue sirviendo la anterior.
- `invalidate: true` purga el CDN de Cloudinary; el `version` guardado fuerza además una URL
  nueva, que es lo que hace el cambio visible de inmediato en lugar de esperar propagación.

**La validación de tipo va por bytes, no por extensión.** El atributo `accept` del input y el
`Content-Type` del envío los controla el cliente y se falsifican trivialmente. Se comprueban las
firmas mágicas: `89 50 4E 47` (PNG), `FF D8 FF` (JPEG), `RIFF....WEBP` (WebP). **SVG queda
excluido** por el requisito y además porque puede contener `<script>`.

Formatos aceptados: **`.png`, `.jpg`, `.jpeg`, `.webp`**. Nada más.

La action usa `accept: 'form'` (no `'json'`) porque recibe un `File` dentro de `FormData`.

### 11.5 UI del panel

`src/components/admin/ImageSlotField.tsx`, un island de React por ranura:

- Vista previa de la imagen **actual**, con su proporción reservada.
- Botón **«Reemplazar imagen»** — nunca «Añadir». No existe botón de eliminar: una ranura del
  layout no puede quedar vacía.
- `<input type="file" accept=".png,.jpg,.jpeg,.webp" />`
- Campo de texto para el `alt`, con su etiqueta y obligatorio.
- Leyenda fija bajo el input, con este texto literal:

  > **Recomendación:** Sube la imagen en formato WebP para mejorar la velocidad de carga de la web.

- Estados: `idle` → `subiendo` (botón deshabilitado + spinner) → toast de 4.5 s reutilizando el
  patrón de `SectionEditor` (acuse efímero, `role="status"`, `aria-live="polite"`).
- Si el archivo excede 5 MB o no es un formato aceptado, se avisa **antes** de subir.

**Dónde vive en el panel.** Cada slot se edita desde la página de su sección
(`/admin/contenido/[key]`), agrupado bajo un bloque «Imágenes de esta sección», para que el
administrador vea texto e imagen del mismo bloque en un solo lugar. El registro se filtra por
`slot.section === key`.

> El uploader **no** se añade al `FIELD_MAP` de la Tanda 6. Ese mapa describe campos del
> documento de la sección, y las imágenes viven en otra colección con otro flujo de guardado
> (subida inmediata, no «guardar cambios»). Mezclarlos obligaría a que el formulario de texto
> supiera de archivos.

### 11.6 Render en la landing

`src/lib/images/url.ts`:

```ts
export function cloudinaryUrl(img: ImageDoc, width: number): string
export function cloudinarySrcSet(img: ImageDoc, slot: ImageSlot): string
```

- Transformaciones por defecto: `f_auto,q_auto,dpr_auto,c_limit`.
  `f_auto` entrega AVIF o WebP según lo que soporte el navegador, así que una imagen subida como
  JPEG se sirve optimizada igualmente — la recomendación de WebP del panel ayuda al peso del
  original, no al de la entrega.
- `srcset` con anchos `[displayWidth, displayWidth*1.5, displayWidth*2]` y el `sizes` del slot.
- `width`/`height` siempre en el HTML, desde el documento.
- `loading="lazy"` en todas menos `hero-principal`.
- Si un slot no tiene documento en la base, se renderiza el placeholder con degradado que ya
  existe en `Videos.astro`, con la misma proporción. **La landing nunca depende de que una imagen
  exista.**

`repository.ts` gana `getLandingImages(): Promise<Record<string, ImageDoc>>`, con **una sola
query**, y con el mismo fallback tolerante de la Tanda 2: si Atlas falla en el build, se
renderizan los placeholders y se registra un warning, en lugar de romper el deploy.

**Migración de los `thumbnail` actuales.** `videos.items[].thumbnail` se elimina del esquema y se
sustituye por los slots `video-1`…`video-7`. Al ser hoy cadenas vacías, la migración es borrar el
campo del esquema y de los 7 items; no hay dato que preservar.

### 11.7 CSP

`img-src` ya es `'self' data: https:`, así que `res.cloudinary.com` está permitido sin cambios.

> **Endurecimiento recomendado:** restringirlo a
> `img-src 'self' data: https://res.cloudinary.com` en lugar de cualquier host `https:`. Reduce
> el margen de un XSS para exfiltrar datos por la URL de una imagen. Es un cambio de una línea en
> `vercel.json` y solo se puede hacer cuando ya no queden imágenes de otros orígenes.

### 11.8 Criterios de aceptación Tanda 11

- [ ] `npm run preflight` falla si falta alguna de las 4 variables de Cloudinary.
- [ ] Subir un PNG a `estudio-biometria-hematica` actualiza `landing_images`, deja
      `updatedBy` con el usuario correcto y dispara el Deploy Hook.
- [ ] El hero renderiza la imagen a la derecha en escritorio y **debajo del CTA** en móvil.
- [ ] Las 6 tarjetas de estudios llevan su imagen correspondiente, emparejada por slot y no por
      posición en el array.
- [ ] La sección de FAQ con imagen de fondo sigue pasando `npm run a11y:contrast`, y el texto del
      acordeón se lee sin esfuerzo en ambos temas.
- [ ] El `publicId` del documento es exactamente el de la tabla 11.1 (sin prefijo de carpeta) y el asset sigue en `asset_folder = landing-laboratorio`, no en la raíz.
- [ ] Reemplazar la misma ranura **dos veces** deja **un solo** asset en Cloudinary
      (verificar en el panel de Media Library) y el `version` cambia.
- [ ] Tras el rebuild, la landing sirve la imagen nueva y el `<img>` lleva `width`, `height` y
      `alt`.
- [ ] `POST` a la action con un `slotId` inventado → **400**, y no se crea ningún documento.
- [ ] `POST` sin sesión → **401**.
- [ ] Subir un `.svg` renombrado a `.png` → **rechazado** (la validación es por bytes).
- [ ] Subir un archivo de 8 MB → rechazado antes de llegar a Cloudinary.
- [ ] Un slot sin documento renderiza el placeholder, con el mismo `aspect-ratio`, y la landing
      no rompe.
- [ ] `npm run a11y:html` sigue en verde: toda `<img>` con `alt`, `width` y `height`.
- [ ] Con Atlas caído, el build emite placeholders y un warning, no un error.
- [ ] La UI no ofrece en ningún punto «añadir» ni «eliminar» imagen, solo «Reemplazar».

### 11.9 Fuera de alcance

Recortes o reencuadre desde el panel · galerías · biblioteca de medios navegable · borrado de
assets · subida múltiple · imágenes en secciones sin slot declarado. Todo ello implicaría que el
administrador pueda cambiar la cantidad de imágenes o el layout, que es justo lo que este diseño
impide por construcción.

## Contexto para las Tandas 12 y 13 — restricciones que NO se pueden romper

Antes de tocar nada, estos son los hechos del proyecto medidos hoy. Las dos
funcionalidades chocan con varios de ellos, y ahí está el trabajo de arquitectura.

### 0.1 Lo que existe

| Pieza | Estado |
|---|---|
| Iconos | **Hardcodeados** en 8 componentes. `PorQueHospital.astro` tiene un array de 6 `path` SVG sueltos; `EstudiosAdicionales.astro` repite un icono para los 11 items. |
| Menú | **Hardcodeado** en `src/lib/nav.ts` → `NAV_ITEMS` (5 entradas). |
| Orden de secciones | **Hardcodeado** en `src/pages/index.astro`: 9 componentes en secuencia fija. |
| Contenido | MongoDB, 11 docs en `landing_sections`, validados con Zod en `src/lib/content/schemas.ts`. |
| Imágenes | MongoDB, `landing_images`, ranuras fijas en `src/lib/images/slots.ts` + ranuras de tarjeta en `cards.ts`. |
| Publicación | Guardar dispara `triggerDeploy()` con debounce (`src/lib/deploy.ts`). |
| Auditoría | `recordChange()` desde `repository.setSection()`. |

### 0.2 Las cuatro restricciones duras

**1. Presupuesto de JS de la landing: 1.99 KB gzip, sin React.**
Es el requisito de negocio ("landing de alto rendimiento") defendido en todas las
Tandas anteriores: se reescribieron `ThemeToggle` y `MobileNav` en vanilla
precisamente para no cargar React (66 KB) en `/`. **Cualquier solución de iconos
que meta React en la landing invalida ese trabajo.**

**2. Contraste WCAG 2.2 AA verificado.**
`npm run a11y:contrast` mantiene 14 combinaciones en verde en ambos temas. Dejar
que el administrador elija colores libres puede romperlo.

**3. `npm run a11y:html` en 15/15.**
Comprueba jerarquía de headings, un solo `<h1>`, `alt` en toda `<img>`, SVG
decorativos con `aria-hidden`. Reordenar secciones puede romper la jerarquía.

**4. La landing es SSG.** Todo se resuelve en build; en producción no hay queries.

### 0.3 Convenciones del proyecto que estas Tandas deben seguir

- **Lo que define la estructura vive en código, no en datos.** Las ranuras de
  imagen son un registro en `slots.ts` justamente para que el panel no pueda
  inventarlas. Los iconos y las secciones siguen el mismo patrón.
- **Zod es la autoridad sobre la validez**, y las actions revalidan la sesión por
  su cuenta (son endpoints POST alcanzables con `curl`).
- **Degradar, no romper**: si falta un dato, se renderiza un valor por defecto y
  se registra un warning; el build nunca cae.

---

## TANDA 12 — Selector dinámico de iconos SVG

**Objetivo:** que el administrador elija el icono y sus colores para cada tarjeta
de `¿Por qué en Hospital Cristal?` y `Estudios adicionales`, sin que la landing
gane un solo byte de JavaScript.

### 12.1 Elección de librería: DOS paquetes, no uno

Esta es la decisión central de la Tanda.

| Contexto | Paquete | Por qué |
|---|---|---|
| **Landing** (`/`) | `@lucide/astro` | Componentes `.astro`. Renderizan SVG **inline en build time**: 0 KB de JS en el cliente. |
| **Dashboard** (`/admin`) | `lucide-react` | El panel ya carga React y no tiene presupuesto de performance. |

> **`lucide-react` NO puede usarse en la landing.** Es una librería de React: su
> primer uso en `/` arrastraría `react` + `react-dom` (~66 KB gzip) y el
> presupuesto pasaría de **1.99 KB a ~68 KB**, un factor de 34. Todo el trabajo
> de las Tandas 1 y 9 existe para evitar exactamente eso.

Verificado contra el registro de npm:

```
@lucide/astro   1.48.0   peerDependencies: { astro: "^4 || ^5 || ^6 || ^7" }   ✓ compatible
                exports: { "./icons/*": "./src/icons/*.ts" }                    ✓ importable icono a icono
lucide-react    1.48.0
```

> **Trampa de nombre:** existe un paquete llamado `dnd-kit` de **115 bytes** que
> no es la librería real (ver 13.5). Verificar siempre el paquete publicado antes
> de instalar.

Instalación:

```bash
npm i @lucide/astro          # landing
npm i -D lucide-react        # solo lo usa el panel, que no se sirve al público
```

### 12.2 Registro de iconos permitidos — `src/lib/icons/catalog.ts`

Lucide tiene ~1.600 iconos. **No se pueden importar todos**: Astro necesita
imports estáticos para hacer tree-shaking, y un `import * as icons` metería el
catálogo entero en el build.

Se declara un **catálogo curado** —entre 40 y 80 iconos pertinentes para un
laboratorio clínico— igual que las ranuras de imagen viven en `slots.ts`:

```ts
// src/lib/icons/catalog.ts
import Activity from '@lucide/astro/icons/activity';
import Beaker from '@lucide/astro/icons/beaker';
import Clock from '@lucide/astro/icons/clock';
import HeartPulse from '@lucide/astro/icons/heart-pulse';
import Microscope from '@lucide/astro/icons/microscope';
import ShieldCheck from '@lucide/astro/icons/shield-check';
import Stethoscope from '@lucide/astro/icons/stethoscope';
import TestTube from '@lucide/astro/icons/test-tube';
// … el resto del catálogo curado

/**
 * Catálogo CERRADO de iconos.
 *
 * Mismo principio que `images/slots.ts`: lo que define la estructura visual vive
 * en código. Consecuencias deliberadas:
 *   - el tree-shaking funciona (imports estáticos), así que el CSS/HTML solo
 *     incluye los iconos realmente usados;
 *   - el panel no puede elegir un icono inexistente: la action rechaza
 *     cualquier nombre fuera de este mapa;
 *   - ampliar el catálogo es un cambio de código y un deploy, que es lo
 *     correcto para algo que forma parte del lenguaje visual del sitio.
 */
export const ICON_CATALOG = {
  activity: { component: Activity, label: 'Actividad', tags: ['salud', 'pulso', 'signos'] },
  beaker: { component: Beaker, label: 'Matraz', tags: ['laboratorio', 'química', 'muestra'] },
  clock: { component: Clock, label: 'Reloj', tags: ['tiempo', 'rapidez', 'mismo día'] },
  'heart-pulse': { component: HeartPulse, label: 'Pulso cardiaco', tags: ['corazón', 'cardiovascular'] },
  microscope: { component: Microscope, label: 'Microscopio', tags: ['laboratorio', 'análisis'] },
  'shield-check': { component: ShieldCheck, label: 'Escudo verificado', tags: ['seguridad', 'confianza', 'calidad'] },
  stethoscope: { component: Stethoscope, label: 'Estetoscopio', tags: ['médico', 'consulta'] },
  'test-tube': { component: TestTube, label: 'Tubo de ensayo', tags: ['muestra', 'sangre', 'estudio'] },
} as const;

export type IconName = keyof typeof ICON_CATALOG;
export const ICON_NAMES = Object.keys(ICON_CATALOG) as IconName[];
export function isIconName(v: unknown): v is IconName {
  return typeof v === 'string' && v in ICON_CATALOG;
}
/** Icono de respaldo cuando el dato falta o no valida. Nunca se renderiza vacío. */
export const FALLBACK_ICON: IconName = 'activity';
```

> **`tags` es lo que hace útil el buscador.** El administrador escribirá «rapidez»
> o «sangre», no `heart-pulse`. Sin etiquetas en español, el buscador solo
> encuentra por el nombre técnico en inglés y el selector se vuelve inservible.

**El catálogo se comparte con el panel** a través de los nombres y etiquetas, pero
**NO de los componentes** (`.astro` no se puede renderizar en React). El panel
resuelve el componente por su cuenta:

```ts
// src/lib/icons/react-catalog.ts   (SOLO lo importa el dashboard)
import * as Lucide from 'lucide-react';
import { ICON_NAMES, ICON_CATALOG, type IconName } from './catalog.ts';

/** "heart-pulse" -> "HeartPulse", que es como lucide-react exporta. */
function toPascal(name: string): string {
  return name.split('-').map((p) => p[0]!.toUpperCase() + p.slice(1)).join('');
}

export const REACT_ICONS = Object.fromEntries(
  ICON_NAMES.map((name) => [name, (Lucide as Record<string, unknown>)[toPascal(name)]]),
) as Record<IconName, React.ComponentType<{ size?: number; color?: string }>>;
```

> **Verificar al implementar** que todos los nombres del catálogo existen en
> ambos paquetes. Un test de una línea (`ICON_NAMES.every((n) => REACT_ICONS[n])`)
> evita que el panel muestre un hueco donde debería ir un icono.

### 12.3 Esquema en MongoDB — `src/lib/content/schemas.ts`

```ts
import { ICON_NAMES } from '../icons/catalog.ts';

/** Color hexadecimal de 6 dígitos, en minúsculas. */
const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, { message: 'Usa un color hexadecimal como #0f766e.' });

export const iconSchema = z.object({
  name: z.enum(ICON_NAMES as [string, ...string[]]),
  /** Color del trazo/relleno del icono. */
  color: hexColor,
  /**
   * Color de fondo de la pastilla. `null` = sin fondo (icono suelto).
   * Se guarda explícitamente en lugar de omitirse para distinguir
   * "sin fondo" de "aún no configurado".
   */
  background: hexColor.nullable(),
});
export type IconConfig = z.infer<typeof iconSchema>;
```

Se añade a los dos repeaters que el cliente señaló:

```ts
// dentro de porQueHospitalSchema
beneficios: z.array(z.object({
  titulo: z.string().min(3).max(80),
  descripcion: z.string().min(10).max(300),
  icon: iconSchema.optional(),      // opcional: los items existentes aún no lo tienen
})).min(1).max(10),

// dentro de estudiosAdicionalesSchema
items: z.array(z.object({
  titulo: z.string().min(3).max(80),
  detalle: z.string().min(1).max(200),
  icon: iconSchema.optional(),
})).min(1).max(20),
```

> **`.optional()` es obligatorio en la primera versión.** Los documentos ya
> guardados no tienen `icon`; sin `optional` el build fallaría la validación de
> las dos secciones y `repository.ts` las sustituiría por el contenido semilla —
> el cliente vería revertirse su contenido real. Se puede endurecer a requerido
> **después** de correr la migración de 12.6.

### 12.4 Render en la landing — `src/components/landing/Icon.astro`

```astro
---
import { ICON_CATALOG, FALLBACK_ICON, isIconName } from '../../lib/icons/catalog.ts';
import type { IconConfig } from '../../lib/content/schemas.ts';

interface Props {
  icon: IconConfig | undefined;
  /** Nombre a usar si `icon` no trae ninguno (el hardcodeado actual). */
  fallbackName?: string;
  size?: number;
}

const { icon, fallbackName, size = 20 } = Astro.props;

// Degradar, nunca romper: dato ausente o corrupto -> icono de respaldo.
const name = isIconName(icon?.name)
  ? icon!.name
  : isIconName(fallbackName) ? fallbackName : FALLBACK_ICON;

const entry = ICON_CATALOG[name];
const LucideIcon = entry.component;

const color = icon?.color ?? 'currentColor';
const background = icon?.background ?? null;
---
{background ? (
  <span
    class="grid size-11 shrink-0 place-items-center rounded-lg"
    style={`background-color: ${background}`}
    aria-hidden="true"
  >
    <LucideIcon size={size} color={color} />
  </span>
) : (
  <span class="shrink-0" aria-hidden="true">
    <LucideIcon size={size} color={color} />
  </span>
)}
```

> **`aria-hidden="true"` no es negociable.** Estos iconos acompañan a un título
> de texto que ya comunica el significado. Exponerlos duplicaría el contenido
> para un lector de pantalla, y `npm run a11y:html` falla si un SVG queda sin
> ocultar (comprobación ya existente: "SVG decorativos con aria-hidden").

Archivos a modificar:

- `src/components/landing/PorQueHospital.astro` — **eliminar** el array `icons`
  de 6 `path` y el `fallbackIcon`; sustituir por `<Icon icon={beneficio.icon} />`.
- `src/components/landing/EstudiosAdicionales.astro` — sustituir el SVG inline
  repetido por `<Icon icon={item.icon} />`.

> **Los demás SVG del proyecto NO se tocan** (check del hero, comilla de
> testimonios, chevron del FAQ, logo, play de videos, iconos del panel). Son parte
> del diseño, no contenido editable, y convertirlos en configurables solo añade
> superficie de error.

### 12.5 UI del panel — Popover de selección

**Archivos nuevos:**

```
src/components/admin/IconPicker.tsx        popover: búsqueda + rejilla + colores
src/components/admin/ColorField.tsx        <input type="color"> + campo hex sincronizados
```

**Integración:** el icono es un campo más del item del repeater, igual que se hizo
con la imagen de tarjeta en la Tanda 11. Se añade un `kind` nuevo al descriptor de
campos:

```ts
// src/components/admin/fieldMap.ts
| { kind: 'icon'; path: string; label: string; hint?: string }
```

…y se renderiza desde `SectionEditor.renderField()`, de modo que **el estado del
icono viaja dentro de `data`** y se guarda con el resto del formulario. No hace
falta una action nueva: `content.updateSection` ya lo persiste.

**Comportamiento del popover:**

- Se abre pulsando la previsualización del icono actual (un botón, no un `div`).
- Campo de búsqueda que filtra por `label` y `tags` **en español**, no solo por el
  nombre técnico.
- Rejilla de resultados navegable con flechas; `Enter` selecciona; `Escape` cierra
  y devuelve el foco al disparador.
- Dos `ColorField`: color del icono y color de fondo, este último con un
  interruptor «sin fondo» que guarda `background: null`.
- Previsualización en vivo que muestra el icono sobre su fondo real.

> **Usar `<dialog>` nativo o un popover con foco gestionado a mano.** La Tanda 1
> ya resolvió esto en `MobileNav.astro` con `<dialog>` + `showModal()`, que aporta
> focus trap, cierre con `Escape` y restauración de foco sin escribir código.
> Replicar ese patrón en lugar de inventar uno nuevo.

**Contraste de los colores elegidos — decisión de diseño:**

```tsx
// Dentro de IconPicker: ratio en vivo, reutilizando la fórmula de
// scripts/contrast-audit.mjs (extraerla a src/lib/color/contrast.ts
// para no duplicarla).
const ratio = contrastRatio(color, background ?? surfaceToken);
```

> El picker **muestra el ratio y avisa por debajo de 3:1**, pero **no bloquea**.
> Motivo: estos iconos son decorativos (`aria-hidden`) y van acompañados de un
> título textual, así que WCAG 1.4.11 no los exige. Un icono ilegible sigue siendo
> mal diseño, y por eso se avisa — pero bloquear una elección que la norma permite
> sería imponer un criterio propio como si fuera un requisito.

### 12.6 Migración — `scripts/migrate-icons.ts`

Los 6 beneficios y los 11 items ya existen sin `icon`. La migración les asigna el
equivalente más cercano a su icono hardcodeado actual:

```ts
const BENEFICIOS_ICONOS: Record<string, IconName> = {
  'resultados el mismo dia':        'clock',
  'precision en cada resultado':    'shield-check',
  'precios accesibles':             'badge-dollar-sign',
  'mas de 200 estudios disponibles':'list-checks',
  'sin complicaciones':             'sparkles',
  'dentro del hospital':            'hospital',
};
```

Reglas, idénticas a las de `scripts/seed-images.ts`:

- Emparejar por **título normalizado** (sin acentos, minúsculas), no por posición.
- `$set` solo del campo `icon` si el item **no** lo tiene ya: no pisar elecciones
  del administrador.
- Color por defecto `#0f766e` (el token `--c-primary` actual) y
  `background: null` para `estudios_adicionales`, `#0f766e1a`… **no**: el fondo
  debe ser un hex de 6 dígitos, así que usar `#e7f4f3`, que es el tinte al 10 %
  ya medido en la Tanda 9.
- Idempotente: correrlo dos veces no cambia nada.

```bash
npm run db:migrate-icons
```

### 12.7 Criterios de aceptación — Tanda 12

- [ ] `npm run build` termina sin warnings `[content]` (los esquemas siguen validando).
- [ ] **El JS de `/` sigue por debajo de 2.5 KB gzip y React NO se carga.**
      Medir con el script del final de este documento. Es el criterio más importante.
- [ ] `npm run a11y:html` sigue en 15/15 (todos los SVG nuevos con `aria-hidden`).
- [ ] El HTML de `/` contiene los SVG **inline**, no referencias a un sprite ni JS.
- [ ] Cambiar un icono en el panel y guardar → rebuild → el icono nuevo aparece.
- [ ] `POST` a `content.updateSection` con `icon.name: "no-existe"` → **400**, y la
      base no se modifica.
- [ ] `icon.color: "rojo"` → 400 con el mensaje del campo.
- [ ] Un documento con `icon` corrupto renderiza el icono de respaldo y registra
      un warning; el build no cae.
- [ ] El popover se abre, busca en español, se cierra con `Escape` y devuelve el foco.
- [ ] Navegación completa del picker **solo con teclado**.

---

## TANDA 13 — Reordenamiento y visibilidad de secciones

**Objetivo:** que el administrador reordene y oculte secciones de la landing, y que
el menú se genere desde ese mismo orden.

### 13.1 Modelo de datos — colección `landing_config`

```jsonc
// landing_config, documento único
{
  "_id": "sections",
  "items": [
    { "id_seccion": "estudios_principales", "titulo_menu": "Estudios",        "orden": 0, "isVisible": true },
    { "id_seccion": "por_que_estudios",     "titulo_menu": "¿Por qué estudios?", "orden": 1, "isVisible": true },
    { "id_seccion": "estudios_adicionales", "titulo_menu": "Adicionales",     "orden": 2, "isVisible": true },
    { "id_seccion": "por_que_hospital",     "titulo_menu": "Beneficios",      "orden": 3, "isVisible": true },
    { "id_seccion": "testimonios",          "titulo_menu": "Testimonios",     "orden": 4, "isVisible": true },
    { "id_seccion": "videos",               "titulo_menu": "Videos",          "orden": 5, "isVisible": true },
    { "id_seccion": "faq",                  "titulo_menu": "Preguntas",       "orden": 6, "isVisible": true },
    { "id_seccion": "cta_final",            "titulo_menu": "Agenda",          "orden": 7, "isVisible": true }
  ],
  "updatedAt": ISODate,
  "updatedBy": { "userId": "...", "name": "...", "email": "..." }
}
```

> **`orden` se RECALCULA en el servidor en cada guardado**, a partir de la
> posición en el array (`items.map((item, i) => ({ ...item, orden: i }))`).
>
> Se conserva el campo porque está en la especificación, pero guardar una
> posición explícita **además** del orden del array crea dos fuentes de verdad que
> pueden discrepar: bastaría un guardado parcial para tener dos secciones con
> `orden: 3`. Normalizarlo en el servidor lo vuelve un campo derivado, imposible
> de desincronizar, y sigue disponible para quien lea la colección directamente.

### 13.2 Registro de secciones — `src/lib/sections/registry.ts`

El documento de configuración guarda **qué orden y qué visibilidad**. **Qué
secciones existen, con qué componente y qué ancla** sigue viviendo en código:

```ts
// src/lib/sections/registry.ts
import type { SectionKey } from '../content/schemas.ts';

export type SectionDefinition = {
  key: SectionKey;
  /** Ancla usada por el menú y por los CTA. Debe coincidir con el `id` del <section>. */
  anchor: string;
  /** Título por defecto en el menú; el panel puede sobrescribirlo. */
  defaultMenuTitle: string;
  /** `false` = no se puede ocultar ni mover. */
  movable: boolean;
  /** Aparece en el menú de navegación cuando es visible. */
  inMenu: boolean;
};

export const SECTION_REGISTRY: readonly SectionDefinition[] = [
  { key: 'hero',                 anchor: 'inicio',      defaultMenuTitle: 'Inicio',             movable: false, inMenu: false },
  { key: 'estudios_principales', anchor: 'estudios',    defaultMenuTitle: 'Estudios',           movable: true,  inMenu: true  },
  { key: 'por_que_estudios',     anchor: 'por-que',     defaultMenuTitle: '¿Por qué estudios?', movable: true,  inMenu: true  },
  { key: 'estudios_adicionales', anchor: 'adicionales', defaultMenuTitle: 'Adicionales',        movable: true,  inMenu: true  },
  { key: 'por_que_hospital',     anchor: 'beneficios',  defaultMenuTitle: 'Beneficios',         movable: true,  inMenu: true  },
  { key: 'testimonios',          anchor: 'testimonios', defaultMenuTitle: 'Testimonios',        movable: true,  inMenu: true  },
  { key: 'videos',               anchor: 'videos',      defaultMenuTitle: 'Videos',             movable: true,  inMenu: true  },
  { key: 'faq',                  anchor: 'faq',         defaultMenuTitle: 'Preguntas',          movable: true,  inMenu: true  },
  { key: 'cta_final',            anchor: 'agendar',     defaultMenuTitle: 'Agenda',             movable: false, inMenu: false },
];
```

#### 13.2.1 Dos secciones quedan fijas, y hay que explicar por qué

**`hero` — `movable: false`.** Contiene el único `<h1>` de la página. Moverlo
rompería la jerarquía de headings (`npm run a11y:html` falla) y ocultarlo dejaría
la landing **sin `<h1>`**, lo que degrada SEO y accesibilidad a la vez. Además es
el LCP: su imagen es la única con `fetchpriority="high"`.

**`cta_final` — `movable: false`.** Contiene el ancla `#agendar`, a la que apuntan
**los 8 CTA** de la landing. Ocultarla convertiría los ocho botones en enlaces
muertos: el visitante pulsa «Agenda tu estudio» y no pasa nada. Es el peor fallo
posible en una landing de conversión.

> Si el cliente insiste en poder ocultar `cta_final`, la implementación correcta
> **no** es permitirlo sin más: hay que redirigir los CTA a un destino alternativo
> (WhatsApp o `tel:`) cuando esa sección no está visible. Eso es trabajo adicional
> y debe planificarse aparte.

`seo` y `avisos` **no entran** en el registro: no son secciones visuales. `seo`
alimenta el `<head>` y `avisos` el `<footer>`, que siempre se renderizan.

### 13.3 Lectura y validación — `src/lib/sections/repository.ts`

```ts
export const sectionConfigItemSchema = z.object({
  id_seccion: z.enum(SECTION_KEYS as [string, ...string[]]),
  titulo_menu: z.string().min(1).max(40),
  orden: z.number().int().min(0),
  isVisible: z.boolean(),
});

export type ResolvedSection = SectionDefinition & { menuTitle: string; visible: boolean };

/**
 * Devuelve las secciones en el orden a renderizar.
 *
 * Reconcilia SIEMPRE contra el registro de código, que es la autoridad sobre qué
 * existe:
 *   - una clave del documento que ya no está en el registro se descarta;
 *   - una sección del registro que falta en el documento se añade al final,
 *     visible. Así, desplegar una sección nueva no exige tocar la base ni deja
 *     la landing sin ella.
 *   - `movable: false` fuerza `visible: true` y su posición del registro.
 * Si el documento no existe o no valida -> orden por defecto del registro.
 */
export async function getSectionLayout(): Promise<ResolvedSection[]>;
export async function setSectionLayout(items, editor): Promise<void>;
```

### 13.4 Render en la landing — `src/pages/index.astro`

El cambio clave: de nueve componentes en secuencia fija a un **mapa + bucle**.

```astro
---
import { getSectionLayout } from '../lib/sections/repository.ts';

const [content, images, layout] = await Promise.all([
  getLandingContent(),
  getLandingImages(),
  getSectionLayout(),
]);

/** Mapa clave -> componente. Los imports siguen siendo estáticos: Astro no puede
 *  hacer tree-shaking de un import dinámico por nombre. */
const COMPONENTS = {
  hero: Hero,
  estudios_principales: EstudiosPrincipales,
  por_que_estudios: PorQueEstudios,
  estudios_adicionales: EstudiosAdicionales,
  por_que_hospital: PorQueHospital,
  testimonios: Testimonios,
  videos: Videos,
  faq: Faq,
  cta_final: CtaFinal,
} as const;

const visible = layout.filter((s) => s.visible);
---
<LandingLayout seo={content.seo} avisos={content.avisos} address={content.hero.address} jsonLd={jsonLd} menu={menu}>
  {visible.map((section, index) => {
    const Component = COMPONENTS[section.key];
    return (
      <Component
        data={content[section.key]}
        images={images}
        /* La alternancia de fondos se calcula por POSICIÓN RENDERIZADA, no dentro
           del componente. Ver 13.4.1. */
        tone={index % 2 === 0 ? 'base' : 'muted'}
        address={content.hero.address}
      />
    );
  })}
</LandingLayout>
```

#### 13.4.1 La alternancia de fondos se rompe al reordenar

Hoy cada componente decide su propio fondo (`<Section tone="muted">` está escrito
dentro de `EstudiosPrincipales.astro`, `EstudiosAdicionales.astro`, `Testimonios.astro`
y `Faq.astro`). Con el orden fijo eso produce la alternancia correcta.

**Al reordenar u ocultar, dos secciones `muted` pueden quedar contiguas** y la
landing muestra una banda doble sin separación. Hay que:

1. Quitar `tone` del interior de cada componente.
2. Pasarlo como prop desde `index.astro`, calculado con el índice renderizado.
3. `Faq.astro` es un caso especial: tiene imagen de fondo con scrim. Su `tone`
   debe seguir aplicando el scrim correcto (`bg-surface-muted/92`), así que acepta
   el prop pero lo usa para elegir el token del scrim, no un fondo plano.

#### 13.4.2 Props heterogéneas

Los componentes no comparten firma: `CtaFinal` recibe `address`, `Hero` no recibe
`images` de tarjeta, etc. Dos opciones:

- **(a) Uniformar las props** de los nueve a `{ data, images, tone, content }`.
  Más refactor, pero el bucle queda limpio y tipado.
- **(b)** Un `switch` en el bucle que construya las props por sección.

**Recomendada: (a).** El bucle es el punto donde el tipado se pierde con más
facilidad; uniformar las firmas es lo que permite que TypeScript siga verificando
el render dinámico.

### 13.5 Menú dinámico — `src/lib/nav.ts`

`NAV_ITEMS` deja de ser una constante:

```ts
export function buildNavItems(layout: ResolvedSection[]): NavItem[] {
  return layout
    .filter((s) => s.visible && s.inMenu)
    .map((s) => ({ label: s.menuTitle, href: `#${s.anchor}` }));
}
```

Archivos a modificar: `LandingLayout.astro` recibe `menu` y lo pasa a
`Header.astro`, que a su vez lo pasa a `MobileNav.astro`. Hoy ambos importan
`NAV_ITEMS` directamente — hay que cortar esa importación.

> **`MobileNav.astro` es vanilla, no React.** No convertirlo a island por esto: el
> menú se renderiza en build y su script actual no necesita cambios.

### 13.6 UI del panel — Drag & Drop

**Librería recomendada: `@hello-pangea/dnd`** (18.0.1) sobre `@dnd-kit/core`.

| | `@hello-pangea/dnd` | `@dnd-kit/core` + `/sortable` |
|---|---|---|
| Arrastre con teclado | Incluido por defecto | Requiere configurar `KeyboardSensor` |
| Anuncios a lector de pantalla | Incluidos y en vivo | Manuales |
| API | Más simple para una lista vertical | Más flexible, más superficie |

Para una única lista vertical de 8 elementos, la flexibilidad de dnd-kit no aporta
y su coste de accesibilidad sí.

> **Trampa verificada:** el paquete `dnd-kit` a secas pesa **115 bytes** y no es la
> librería. Los paquetes reales son `@dnd-kit/core` y `@dnd-kit/sortable`.

**Archivo nuevo:** `src/components/admin/SectionLayoutEditor.tsx`

```tsx
<DragDropContext onDragEnd={onDragEnd}>
  <Droppable droppableId="sections">
    {(provided) => (
      <ul ref={provided.innerRef} {...provided.droppableProps}>
        {items.map((item, index) => (
          <Draggable key={item.id_seccion} draggableId={item.id_seccion} index={index} isDragDisabled={!item.movable}>
            {/* asa de arrastre + título + input del menú + switch + botones ↑ ↓ */}
          </Draggable>
        ))}
        {provided.placeholder}
      </ul>
    )}
  </Droppable>
</DragDropContext>
```

> **Los botones ↑ ↓ son OBLIGATORIOS, no un extra.** Drag & drop es una mejora
> progresiva: con teclado, con motricidad reducida o en un táctil pequeño, arrastrar
> es difícil o imposible. `RepeaterField.tsx` ya implementa exactamente este patrón
> —mover arriba/abajo con `aria-label` que incluye el nombre del elemento— y debe
> replicarse. La lista tiene que ser completamente utilizable **sin arrastrar nada**.

**Ruta nueva:** `src/pages/admin/secciones.astro` (`prerender = false`), con su
entrada en el sidebar de `AdminLayout.astro`.

**Action nueva:**

```ts
// src/actions/index.ts
sections: {
  updateLayout: defineAction({
    accept: 'json',
    input: z.object({ items: z.array(sectionConfigItemSchema).min(1).max(20) }),
    handler: async ({ items }, context) => {
      const user = requireUser(context.locals);          // las actions revalidan
      await setSectionLayout(items, user);                // normaliza `orden` y fuerza los fijos
      const deploy = await triggerDeploy({ reason: 'layout', actor: { name: user.name } });
      return { ok: true as const, savedAt: new Date().toISOString(), deploy };
    },
  }),
},
```

`setSectionLayout` debe, en el servidor:
1. descartar claves fuera del registro;
2. forzar `isVisible: true` y su posición original en las secciones `movable: false`;
3. recalcular `orden` desde el índice del array;
4. llamar a `recordChange()` para que `/admin/usuarios` refleje el cambio.

### 13.7 Migración — `scripts/seed-section-layout.ts`

Crea el documento con el orden **actual** de `index.astro`, para que la primera
ejecución no altere nada de lo que el cliente ve hoy.

```bash
npm run db:seed-layout
```

`$setOnInsert`: correrlo de nuevo no pisa la configuración del administrador.

### 13.8 Criterios de aceptación — Tanda 13

- [ ] Con la base vacía de `landing_config`, la landing renderiza en el orden
      actual (fallback al registro) y el build no cae.
- [ ] Reordenar en el panel → guardar → rebuild → las secciones salen en el orden
      nuevo en `dist/index.html`.
- [ ] El menú del header y el móvil reflejan el orden y **omiten las ocultas**.
- [ ] Ocultar una sección → desaparece del HTML **y** del menú, y su ancla ya no existe.
- [ ] La alternancia de fondos sigue siendo correcta tras reordenar: **nunca dos
      bandas `muted` contiguas**.
- [ ] `hero` y `cta_final` no se pueden mover ni ocultar desde la interfaz, **y** un
      `POST` directo que intente hacerlo es normalizado por el servidor.
- [ ] `npm run a11y:html` en 15/15: sigue habiendo **exactamente un `<h1>`** y la
      jerarquía de headings no tiene saltos en cualquier orden.
- [ ] La lista es completamente utilizable **con solo teclado**, sin arrastrar.
- [ ] Un lector de pantalla anuncia el movimiento al reordenar.
- [ ] `id_seccion` desconocido en la action → **400**, sin escribir.
- [ ] Sin sesión → **401**.
- [ ] Guardar el orden dispara el Deploy Hook con el debounce de la Tanda 7.
- [ ] `/admin/usuarios` muestra al autor del cambio de orden.

---

## Contexto para las Tandas 14 y 15 — captación de leads

Las dos Tandas siguientes añaden un formulario de captación y un gestor de CTAs.
Antes de tocar código hay **un bloqueante legal** y **una restricción técnica**
que condicionan todo el diseño.

### C.1 BLOQUEANTE: el formulario recoge datos personales sensibles

Dos de las preguntas de `preguntas-formulario.md` capturan intención clínica
asociada a una persona identificable:

> «¿Cuál es el motivo principal de tu consulta hoy?» → *«Presento síntomas o
> malestar y quiero revisarme»*
>
> «¿Qué tipo de estudio necesitas?» → *«Control de glucosa o diabetes»*

En México, la **LFPDPPP** clasifica los datos de salud como **sensibles**
(art. 3 fr. VI) y exige **consentimiento expreso y por escrito** (art. 9), además
de un aviso de privacidad accesible antes de la recolección.

Estado verificado hoy: **`/aviso-de-privacidad` no existe** —el footer ya enlaza
a un 404 desde la Tanda 3— y el formulario planteado no tiene casilla de
consentimiento.

**Tres requisitos de lanzamiento, no opcionales:**

1. Crear `src/pages/aviso-de-privacidad.astro` con el aviso redactado por el
   cliente o su asesor legal. **No lo redacta el desarrollador.**
2. Casilla de consentimiento **obligatoria, sin marcar por defecto**, en el paso
   final: *«He leído y acepto el [aviso de privacidad] y autorizo el tratamiento
   de mis datos personales sensibles para agendar mis estudios.»*
3. Guardar `consentimiento: true` y su marca de tiempo junto al lead. Un
   consentimiento que no se puede demostrar no existe a efectos prácticos.

> **Consideración adicional que el cliente debe decidir**, no el desarrollador:
> registrar intención clínica en Google Sheets coloca datos de salud en
> infraestructura de un tercero fuera de México. Es viable —la LFPDPPP lo permite
> con el aviso adecuado—, pero tiene que estar declarado en el aviso de
> privacidad. Si el cliente prefiere no hacerlo, la alternativa es registrar en
> Sheets **solo** nombre, medio y fecha, y dejar el motivo y el tipo de estudio
> únicamente en el mensaje que llega por WhatsApp o correo.

### C.2 RESTRICCIÓN: el presupuesto de JavaScript de la landing

Medido hoy: **1995 B gz, sin React**. Un formulario modal de 3 pasos es
interactividad real, y es la primera funcionalidad del proyecto que la necesita
en la página pública.

| Opción | Coste inicial en `/` | Veredicto |
|---|---|---|
| Island de React (`client:load`) | **~68 KB** (34×) | Descartada |
| Island de React (`client:idle`) | ~68 KB, solo diferido | Descartada: lo paga todo visitante |
| **Vanilla + `import()` dinámico al primer clic** | **0 B** | **Elegida** |

El formulario solo se necesita cuando alguien pulsa un CTA. Un script vanilla
diminuto escucha los clics y carga el módulo del formulario bajo demanda:

```ts
// El coste lo paga SOLO quien interactúa. Quien lee la landing y se va
// no descarga un byte de formulario.
document.addEventListener('click', async (event) => {
  const trigger = (event.target as HTMLElement).closest('[data-lead-form]');
  if (!trigger) return;
  event.preventDefault();
  const { openLeadForm } = await import('../lib/leads/form-client.ts');
  openLeadForm(trigger.getAttribute('data-servicio') ?? '');
});
```

Precedente en el proyecto: `ThemeToggle` y `MobileNav` ya son vanilla por esta
misma razón (Tanda 1), y `MobileNav` usa `<dialog>` + `showModal()`, que aporta
focus trap, cierre con `Escape` y fondo inerte sin escribir código. El formulario
reutiliza ese patrón.

**Criterio de aceptación no negociable:** `npm run budget` debe seguir pasando
con el presupuesto actual. El módulo del formulario no cuenta porque no se
descarga en la carga inicial, pero **hay que medirlo aparte** y mantenerlo por
debajo de 8 KB gz.

---

## TANDA 14 — Configuración de contacto, CTAs y preguntas editables

**Objetivo:** que el administrador decida qué hace cada CTA, edite el texto de
las preguntas y configure los destinos de contacto. Sin tocar la landing todavía.

### 14.1 Dónde vive cada dato: configuración vs. credenciales

| Dato | Dónde | Por qué |
|---|---|---|
| Número de WhatsApp | MongoDB, editable | No es secreto; el cliente lo cambia sin desplegar |
| Número para llamadas | MongoDB, editable | Ídem |
| Correo de destino | MongoDB, editable | Ídem |
| `WEB3FORMS_ACCESS_KEY` | **Variable de entorno** | Credencial: quien la tenga puede enviar correos en tu nombre |
| `SHEETS_WEBHOOK_URL` | **Variable de entorno** | Endpoint de escritura sin autenticación de usuario |
| `SHEETS_WEBHOOK_TOKEN` | **Variable de entorno** | Secreto compartido con el Apps Script |

> El requerimiento dice «configurado en el Dashboard» para el correo y los
> números, y así se implementa. Las **credenciales** no: ponerlas en una
> colección que el panel edita significa que un fallo de autorización se
> convierte en filtración de credenciales, y que quedan en los respaldos de la
> base. Van en `.env` y en Vercel, como el resto (`MONGODB_URI`,
> `BETTER_AUTH_SECRET`, `CLOUDINARY_API_SECRET`).

### 14.2 Registro de preguntas — `src/lib/leads/questions.ts`

El requerimiento es explícito: el admin **solo** reformula textos y modifica
opciones; **no** puede añadir ni eliminar preguntas. Mismo principio que las
ranuras de imagen (`slots.ts`), el catálogo de iconos (`names.ts`) y el registro
de secciones (`registry.ts`): **lo que define la estructura vive en código.**

```ts
// src/lib/leads/questions.ts
export type QuestionId =
  | 'contacto'   // persistente en los 3 pasos
  | 'motivo'     // paso 1
  | 'estudio'    // paso 2
  | 'plazo';     // paso 2

export type QuestionDefinition = {
  id: QuestionId;
  /** 0 = persistente, visible en todos los pasos. */
  step: 0 | 1 | 2 | 3;
  /** Texto por defecto; el panel puede reformularlo. */
  defaultLabel: string;
  /** Opciones por defecto. El panel puede editar sus etiquetas. */
  defaultOptions: ReadonlyArray<{ value: string; label: string; featured?: boolean }>;
  /** `false` = el panel no puede añadir ni quitar opciones (solo la de contacto). */
  optionsEditable: boolean;
  layout: 'stack' | 'inline';
};

export const QUESTIONS: readonly QuestionDefinition[] = [
  {
    id: 'contacto',
    step: 0,
    defaultLabel: '¿Cómo prefieres que te contactemos?',
    // CERRADAS: cada valor activa una rama de envío distinta en 15.4.
    // Añadir una opción sin implementar su rama dejaría un envío muerto.
    optionsEditable: false,
    layout: 'inline',
    defaultOptions: [
      { value: 'whatsapp', label: 'WhatsApp', featured: true },
      { value: 'llamada',  label: 'Llamada telefónica' },
      { value: 'correo',   label: 'Correo electrónico' },
    ],
  },
  {
    id: 'motivo',
    step: 1,
    defaultLabel: '¿Cuál es el motivo principal de tu consulta hoy?',
    optionsEditable: true,
    layout: 'stack',
    defaultOptions: [
      { value: 'chequeo',  label: 'Chequeo preventivo de rutina (revisión general anual)' },
      { value: 'orden',    label: 'Indicación u orden de mi médico' },
      { value: 'sintomas', label: 'Presento síntomas o malestar y quiero revisarme' },
    ],
  },
  {
    id: 'estudio',
    step: 2,
    defaultLabel: '¿Qué tipo de estudio o perfil necesitas realizarte?',
    optionsEditable: true,
    layout: 'stack',
    defaultOptions: [
      { value: 'checkup',    label: 'Check-up general o preventivo (Biometría, Química, Orina)' },
      { value: 'glucosa',    label: 'Control de glucosa o diabetes (Hemoglobina glucosilada)' },
      { value: 'lipidos',    label: 'Salud cardiovascular y colesterol (Perfil de lípidos)' },
      { value: 'hormonal',   label: 'Perfiles hormonales o tiroideos' },
      { value: 'orientacion',label: 'Otro estudio especializado / Requiero orientación' },
    ],
  },
  {
    id: 'plazo',
    step: 2,
    defaultLabel: '¿Para cuándo planeas realizarte tus estudios?',
    optionsEditable: true,
    layout: 'inline',
    defaultOptions: [
      { value: 'inmediato', label: 'Lo antes posible (Hoy o mañana)' },
      { value: 'semana',    label: 'Esta misma semana' },
      { value: 'mes',       label: 'En los próximos 15 a 30 días' },
      { value: 'cotizando', label: 'Solo estoy cotizando por el momento' },
    ],
  },
];

export const QUESTION_IDS = QUESTIONS.map((q) => q.id);
export function isQuestionId(v: unknown): v is QuestionId { /* … */ }
export function getQuestion(id: string) { /* … */ }
```

> **`value` es INMUTABLE y `label` es editable.** Es el mismo patrón que resolvió
> el renombrado de tarjetas en la Tanda 13: si el emparejamiento dependiera del
> texto, reformular «Control de glucosa o diabetes» rompería el histórico de
> leads ya registrados en Sheets. El panel edita etiquetas; los valores no se
> tocan.
>
> Al **añadir** una opción, el servidor genera su `value` (igual que `imageKey`).
> Al **eliminar** una, los leads antiguos conservan su texto porque en Sheets se
> registra la etiqueta, no el código.

### 14.3 Esquema en MongoDB — documento `lead_form` en `landing_config`

```jsonc
{
  "_id": "lead_form",
  "contacto": {
    "whatsapp": "+525512345678",      // E.164
    "telefono": "+525512345678",
    "correo": "laboratorio@hospitalcristal.mx"
  },
  "preguntas": {
    "contacto": { "label": "¿Cómo prefieres que te contactemos?", "options": [ /* value+label */ ] },
    "motivo":   { "label": "…", "options": [ /* … */ ] },
    "estudio":  { "label": "…", "options": [ /* … */ ] },
    "plazo":    { "label": "…", "options": [ /* … */ ] }
  },
  "textos": {
    "titulo": "Agenda tus estudios",
    "exito": "¡Listo! Te contactaremos muy pronto.",
    "consentimiento": "He leído y acepto el aviso de privacidad…"
  },
  "updatedAt": ISODate,
  "updatedBy": { "userId": "…", "name": "…", "email": "…" }
}
```

Validación en `src/lib/leads/schemas.ts`:

```ts
const e164 = z.string().regex(/^\+[1-9]\d{7,14}$/, {
  message: 'Usa formato internacional, por ejemplo +525512345678.',
});

export const leadFormConfigSchema = z.object({
  contacto: z.object({
    whatsapp: e164,
    telefono: e164,
    correo: z.email(),
  }),
  preguntas: z.record(
    z.enum(QUESTION_IDS as [string, ...string[]]),
    z.object({
      label: z.string().trim().min(5).max(160),
      options: z.array(z.object({
        value: z.string().min(1).max(40),
        label: z.string().trim().min(1).max(120),
        featured: z.boolean().optional(),
      })).min(2).max(8),
    }),
  ),
  textos: z.object({ /* … */ }),
});
```

> **E.164 con `+` y sin espacios** no es un capricho: la URL de WhatsApp
> (`api.whatsapp.com/send?phone=`) exige el número **sin** `+`, sin espacios y
> sin guiones, mientras que `tel:` acepta el `+`. Guardar un formato canónico y
> derivar los dos evita que un número escrito como `55 1234 5678` produzca un
> enlace de WhatsApp que no abre ningún chat — un fallo silencioso que solo se
> detecta perdiendo leads.

### 14.4 Mapeo de CTAs — extensión del esquema existente

El `cta` actual es `{ label, href }` en 8 secciones. Se amplía:

```ts
// src/lib/content/schemas.ts
const cta = z.object({
  label: z.string().min(1).max(60),
  /**
   * `link` = navega al `href`. `form` = abre el formulario modal.
   * `.default('link')` es OBLIGATORIO: los 8 CTA ya guardados no tienen `mode`,
   * y sin valor por defecto las 8 secciones dejarían de validar y
   * `repository.ts` las sustituiría por el contenido semilla.
   */
  mode: z.enum(['link', 'form']).default('link'),
  href: z.string().min(1).max(300),
});
```

`Button.astro` decide qué renderizar:

```astro
{mode === 'form' ? (
  /* <button>, no <a>: no navega a ningún sitio. Un enlace con href="#" que
     abre un modal miente a los lectores de pantalla y al menú contextual. */
  <button type="button" data-lead-form data-servicio={servicio} class:list={[...]}>
    <slot />
  </button>
) : (
  <a href={href} {...isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}}>
    <slot />
  </a>
)}
```

> **`data-servicio`** lleva la sección de origen (`estudios`, `beneficios`…). Se
> registra en el lead: saber desde qué sección convirtió alguien es la
> información que hace accionable la hoja de cálculo.

### 14.5 Resuelve el enlace muerto del CTA final

Desde la Tanda 3 hay un pendiente registrado: los 8 CTA apuntan a `#agendar`, y
el botón **dentro** de esa sección se enlaza a sí mismo. Con `mode: 'form'` el
problema desaparece: el CTA abre el formulario en lugar de navegar.

La migración (14.7) pone los 8 en `mode: 'form'` por defecto, que es lo que el
cliente pidió. `cta_final` deja de ser un enlace muerto.

### 14.6 UI del panel

**Ruta nueva:** `src/pages/admin/formulario.astro` (`prerender = false`), con su
entrada en el sidebar de `AdminLayout.astro`.

**Componentes nuevos:**

```
src/components/admin/LeadFormEditor.tsx     contactos + textos + preguntas
src/components/admin/QuestionEditor.tsx     una pregunta: label + opciones
```

Reglas de la interfaz, derivadas del requerimiento:

- **No existe botón «Añadir pregunta» ni «Eliminar pregunta».** No es que estén
  deshabilitados: no se renderizan. Y la action rechaza cualquier `id` fuera del
  registro, así que ocultarlos no es la defensa —lo es el registro en código.
- La pregunta `contacto` muestra sus 3 opciones **en solo lectura**, con una nota
  explicando que cada una activa una rama de envío distinta.
- Las otras tres permiten editar etiquetas y añadir/quitar opciones (mín. 2,
  máx. 8), reutilizando el patrón de `RepeaterField` con sus botones ↑ ↓.

**El mapeo de CTAs NO vive aquí.** Cada CTA se edita en su propia sección
(`/admin/contenido/[key]`), junto al texto del botón, que es donde el
administrador ya lo busca. Se añade un `kind` nuevo al `fieldMap`:

```ts
| { kind: 'select'; path: string; label: string; options: Array<{ value: string; label: string }>; hint?: string }
```

…y la sección declara:

```ts
{ kind: 'select', path: 'cta.mode', label: 'Acción del botón', options: [
    { value: 'form', label: 'Abrir formulario de contacto' },
    { value: 'link', label: 'Ir a un enlace' },
]},
{ kind: 'text', path: 'cta.href', label: 'Destino del enlace',
  hint: 'Solo se usa si la acción es "Ir a un enlace".' },
```

### 14.7 Migración — `scripts/seed-lead-form.ts`

```bash
npm run db:seed-lead-form
```

- Crea `lead_form` con las preguntas del registro (`$setOnInsert`, idempotente).
- Deja los contactos **vacíos** y hace que `preflight` avise hasta que se
  rellenen: un número de WhatsApp de ejemplo en producción envía leads a un
  desconocido.
- Pone `cta.mode = 'form'` en las 8 secciones que aún no lo tengan.

### 14.8 Criterios de aceptación — Tanda 14

- [ ] `npm run build` sin warnings `[content]`: las 8 secciones siguen validando
      con `mode` por defecto.
- [ ] El panel no ofrece añadir ni eliminar preguntas en ningún punto.
- [ ] `POST` a la action con un `id` de pregunta inventado → **400**, sin escribir.
- [ ] `POST` que intenta cambiar las opciones de `contacto` → se descartan y se
      conservan las tres del registro.
- [ ] Un teléfono como `55 1234 5678` → **400** con el mensaje del campo.
- [ ] Un correo inválido → **400**.
- [ ] Cambiar el CTA de una sección a «Ir a un enlace» y guardar → el HTML
      renderiza `<a href>`; con «Abrir formulario» renderiza `<button>`.
- [ ] `npm run preflight` avisa mientras los contactos estén vacíos.
- [ ] Sin sesión → **401**.

---

## TANDA 15 — Formulario multi-paso, envío y registro de leads

**Objetivo:** el formulario funcionando en la landing, con sus tres rutas de
envío y el registro en Google Sheets.

### 15.1 Estructura de pasos

La primera pregunta **no es un paso**: es una cabecera persistente visible en los
tres, tal como pide el requerimiento.

```
┌─ Persistente ─────────────────────────────────────────────┐
│ ¿Cómo prefieres que te contactemos?                        │
│  ( ) WhatsApp ★   ( ) Llamada telefónica   ( ) Correo      │
└────────────────────────────────────────────────────────────┘
  Paso 1 de 3   Motivo principal de tu consulta
  Paso 2 de 3   Tipo de estudio  +  Para cuándo
  Paso 3 de 3   Nombre completo  +  contacto dinámico  +  consentimiento
```

- La cabecera se renderiza **una vez**, fuera del contenedor de pasos, así que
  cambiar de paso no la remonta ni pierde la selección.
- El campo de contacto del paso 3 **depende de la cabecera**: teléfono de 10
  dígitos para `whatsapp` y `llamada`, correo para `correo`. Cambiar la
  preferencia en el paso 3 debe cambiar el campo **sin** perder lo escrito en el
  otro: se guardan los dos valores en el estado y se muestra el que toca.

**Accesibilidad de los pasos** —los tres puntos que más se olvidan:

1. `<fieldset>` + `<legend>` por cada grupo de opciones. Un grupo de radios sin
   `fieldset` deja al lector de pantalla sin saber a qué pregunta pertenece cada
   opción.
2. Al avanzar de paso, mover el foco al encabezado del paso nuevo y anunciarlo
   con `aria-live`. Sin esto el foco se queda en el botón «Siguiente», que ya no
   existe en el DOM, y el usuario de teclado queda a la deriva.
3. `<dialog>` + `showModal()` para el contenedor, con `m-auto` — **el reset de
   Tailwind aplica `margin: 0` a `*` y anula el centrado del navegador**, como se
   documentó al corregir el selector de iconos.

### 15.2 Archivos

```
src/lib/leads/questions.ts        registro (Tanda 14)
src/lib/leads/schemas.ts          Zod: config + payload del lead
src/lib/leads/repository.ts       lee config, guarda lead en Mongo
src/lib/leads/sheets.ts           cliente del webhook de Apps Script
src/lib/leads/web3forms.ts        envío de correo
src/lib/leads/form-client.ts      ← módulo cargado BAJO DEMANDA (vanilla)
src/components/landing/LeadForm.astro   markup del <dialog>, renderizado en build
src/pages/api/leads.ts            endpoint público de envío
```

> **El markup se renderiza en build** dentro de `LandingLayout`, oculto en un
> `<dialog>`. Solo el comportamiento llega bajo demanda. Así el formulario
> existe en el HTML —indexable, y utilizable en cuanto carga el módulo— sin
> costar JavaScript por adelantado.

### 15.3 Endpoint — `src/pages/api/leads.ts`

```ts
export const prerender = false;
export const POST: APIRoute = async ({ request, clientAddress }) => { /* … */ };
```

> **Ruta API con `fetch`, NO una Astro Action.** Importar `astro:actions` en el
> cliente añade su runtime al bundle de la landing; un `fetch` a una ruta no
> añade nada. En el panel las actions valen la pena por el tipado; aquí el
> presupuesto manda.

**Defensas obligatorias de un endpoint público:**

| Defensa | Implementación |
|---|---|
| Honeypot | Campo `<input>` oculto `empresa`; si llega con valor → responder 200 y **descartar**. Responder 200 evita que el bot aprenda. |
| Tiempo mínimo | Marca de tiempo al abrir el modal; un envío en < 3 s es un bot. |
| Rate limit por IP | Colección `lead_rate` con índice TTL: máx. 5 envíos por IP / 10 min. |
| Validación Zod | El payload completo, igual que las actions del panel. |
| Tamaño | `Content-Length` máximo de 8 KB. |

**Orden de operaciones, que importa:**

```
1. validar payload (Zod)          → 400 si falla
2. rate limit + honeypot          → descarta en silencio
3. leer config de MongoDB         → números y correo de destino
4. guardar lead en `leads`        → la fuente de verdad propia
5. registrar en Google Sheets     → si falla, NO aborta (ver abajo)
6. si medio = correo → Web3Forms  → si falla, SÍ aborta: es la entrega
7. responder { ok, medio, waUrl?, telUrl? }
```

> **Un fallo de Sheets no debe perder el lead.** Sheets es un registro
> secundario; la fuente de verdad es la colección `leads` en MongoDB. Si el
> Apps Script está caído se anota `sheetsError` en el documento y se sigue: el
> cliente recibe su contacto igualmente. Al revés sería absurdo — perder un
> paciente porque una hoja de cálculo no respondió.

### 15.4 Las tres rutas de envío

#### WhatsApp

```ts
// El número se guarda en E.164 (+525512345678); la API lo exige SIN el `+`.
const phone = config.contacto.whatsapp.replace(/\D/g, '');
const texto = [
  `Hola, quiero agendar estudios de laboratorio.`,
  ``,
  `Nombre: ${lead.nombre}`,
  `Motivo: ${labelDe('motivo', lead.motivo)}`,
  `Estudio: ${labelDe('estudio', lead.estudio)}`,
  `Cuándo: ${labelDe('plazo', lead.plazo)}`,
].join('\n');

const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(texto)}`;
```

> **Trampa crítica: el bloqueador de ventanas emergentes.**
>
> `window.open()` después de un `await` pierde el contexto de gesto de usuario y
> el navegador lo bloquea. El lead se guarda pero la pestaña de WhatsApp no
> abre, y el visitante cree que falló.
>
> Solución: abrir la ventana **de forma síncrona** en el manejador del clic,
> antes del `await`, y asignarle la URL después:
>
> ```ts
> // Síncrono, dentro del gesto del usuario:
> const win = medio === 'whatsapp' ? window.open('about:blank', '_blank') : null;
> const res = await fetch('/api/leads', { /* … */ });
> const data = await res.json();
> if (win) win.location.href = data.waUrl;
> else mostrarEnlaceManual(data.waUrl);   // el bloqueador ganó: enlace visible
> ```
>
> El `else` no es defensivo por gusto: algunos navegadores bloquean incluso la
> apertura síncrona, y sin él ese visitante se queda sin salida.

Tras abrir: **limpiar los inputs y mostrar el mensaje de éxito dentro del modal**,
como pide el requerimiento.

#### Correo — Web3Forms

Se envía **desde el servidor**, no desde el navegador:

```ts
// src/lib/leads/web3forms.ts
const response = await fetch('https://api.web3forms.com/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({
    access_key: requireEnv('WEB3FORMS_ACCESS_KEY'),
    subject: `Nuevo lead: ${lead.nombre} — ${labelDe('estudio', lead.estudio)}`,
    from_name: 'Landing Laboratorio Hospital Cristal',
    // Destino configurado en el Dashboard, no en la clave de Web3Forms.
    to: config.contacto.correo,
    ...campos,
  }),
  signal: AbortSignal.timeout(10_000),
});
```

> Web3Forms permite su clave en el cliente, pero enviarla en el bundle deja que
> cualquiera use tu cuota para enviar correos con tu remitente. Desde el
> servidor la clave no sale nunca.

#### Llamada

```ts
const telUrl = `tel:${config.contacto.telefono}`;   // E.164 con `+`, válido en tel:
window.location.href = telUrl;
```

> En escritorio `tel:` puede no hacer nada. El mensaje de éxito debe **mostrar el
> número en texto**, para que se pueda marcar a mano.

### 15.5 Google Apps Script — código exacto para desplegar

**Paso 1.** Crea una hoja de cálculo en Google Sheets. El nombre da igual; las
tres pestañas las crea el script solo.

**Paso 2.** En esa hoja: **Extensiones → Apps Script**. Borra lo que haya y pega
**exactamente** esto:

```javascript
/**
 * Registro de leads de la landing del Laboratorio Clínico Hospital Cristal.
 *
 * Crea una pestaña por medio de contacto (WhatsApp, Correo, Llamada) y añade
 * una fila por lead con las columnas: nombre, correo, telefono, servicio,
 * medio, fecha.
 */

// Debe coincidir EXACTAMENTE con SHEETS_WEBHOOK_TOKEN en el proyecto.
// Genera uno con: openssl rand -hex 32
var TOKEN = 'PEGA_AQUI_TU_TOKEN';

var HEADERS = ['nombre', 'correo', 'telefono', 'servicio', 'medio', 'fecha'];

// El valor de `medio` que envía el sitio -> nombre de la pestaña.
var SHEETS = {
  whatsapp: 'WhatsApp',
  correo: 'Correo',
  llamada: 'Llamada'
};

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Sin cuerpo en la petición' });
    }

    var body = JSON.parse(e.postData.contents);

    // La app web se despliega como "Cualquier persona", así que sin este
    // control cualquiera podría escribir en la hoja.
    if (body.token !== TOKEN) {
      return json({ ok: false, error: 'No autorizado' });
    }

    var nombreHoja = SHEETS[String(body.medio || '').toLowerCase()];
    if (!nombreHoja) {
      return json({ ok: false, error: 'Medio desconocido: ' + body.medio });
    }

    // Un solo escritor a la vez: dos leads simultáneos podrían pisarse la fila.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);

    try {
      var hoja = obtenerHoja(nombreHoja);
      hoja.appendRow([
        body.nombre || '',
        body.correo || '',
        body.telefono || '',
        body.servicio || '',
        body.medio || '',
        body.fecha || new Date().toISOString()
      ]);
    } finally {
      lock.releaseLock();
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

/** Devuelve la pestaña, creándola con sus encabezados si no existe. */
function obtenerHoja(nombre) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(nombre);

  if (!hoja) {
    hoja = libro.insertSheet(nombre);
  }

  if (hoja.getLastRow() === 0) {
    hoja.appendRow(HEADERS);
    hoja.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }

  return hoja;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Opcional: ejecútala una vez desde el editor para crear las tres pestañas. */
function inicializar() {
  for (var clave in SHEETS) {
    obtenerHoja(SHEETS[clave]);
  }
}
```

**Paso 3.** Genera un token y pégalo en `var TOKEN`:

```bash
openssl rand -hex 32
```

**Paso 4.** Guarda (💾) y, opcionalmente, ejecuta la función `inicializar` una
vez para ver las tres pestañas creadas. Google pedirá autorización: acéptala.

**Paso 5.** **Implementar → Nueva implementación**:

| Campo | Valor |
|---|---|
| Tipo | **Aplicación web** |
| Descripción | `Leads landing laboratorio` |
| Ejecutar como | **Yo** (tu cuenta) |
| Quién tiene acceso | **Cualquier persona** |

> «Cualquier persona» es obligatorio: el servidor de Vercel no puede iniciar
> sesión con tu cuenta de Google. Por eso el `TOKEN` es lo único que protege el
> endpoint — trátalo como una contraseña.

**Paso 6.** Copia la **URL de la aplicación web**. Termina en `/exec`:

```
https://script.google.com/macros/s/AKfycb…/exec
```

**Paso 7.** Añade las tres variables a `.env` **y** a Vercel (Production y
Preview). **Sin comillas**, como el resto del proyecto:

```bash
# .env
SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/AKfycb…/exec
SHEETS_WEBHOOK_TOKEN=el-mismo-token-del-paso-3
WEB3FORMS_ACCESS_KEY=tu-access-key-de-web3forms
```

Añádelas también a `.env.example` (sin valores) y a la comprobación de
`scripts/preflight.mjs`, junto al bloque de Cloudinary.

> **Cada vez que edites el `.gs` hay que volver a implementar.** Apps Script
> sirve la versión desplegada, no la guardada: en «Implementar → Gestionar
> implementaciones» hay que editar la existente y elegir **Nueva versión**. Si se
> crea una implementación nueva en lugar de una versión, **la URL cambia** y hay
> que actualizar `SHEETS_WEBHOOK_URL`.

**Paso 8.** Prueba el webhook antes de conectar nada:

```bash
curl -L -X POST "$SHEETS_WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"token":"TU_TOKEN","nombre":"Prueba","correo":"a@b.com",
       "telefono":"+525512345678","servicio":"Check-up general",
       "medio":"whatsapp","fecha":"2026-01-01T12:00:00.000Z"}'
```

> **`-L` es necesario**: Apps Script responde con una redirección 302 a
> `googleusercontent.com` y el cuerpo real viaja ahí. Un cliente que no siga
> redirecciones interpretará el 302 como fallo. `fetch` de Node las sigue por
> defecto, pero conviene comprobarlo explícitamente en `sheets.ts`.

Debe responder `{"ok":true}` y aparecer una fila en la pestaña **WhatsApp**.

### 15.6 Cliente de Sheets — `src/lib/leads/sheets.ts`

```ts
export async function logLead(lead: LeadRecord): Promise<{ ok: boolean; error?: string }> {
  const url = optionalEnv('SHEETS_WEBHOOK_URL');
  const token = optionalEnv('SHEETS_WEBHOOK_TOKEN');

  // Sin configurar no es un error: permite desarrollar sin escribir en la hoja
  // real, igual que `VERCEL_DEPLOY_HOOK_URL` vacío en la Tanda 7.
  if (!url || !token) return { ok: false, error: 'disabled' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...lead }),
      redirect: 'follow',              // Apps Script responde 302
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json();
    return data?.ok ? { ok: true } : { ok: false, error: data?.error ?? 'respuesta inesperada' };
  } catch (error) {
    // NUNCA propagar: el lead ya está en MongoDB.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

### 15.7 Colección `leads` en MongoDB

```jsonc
{
  "_id": ObjectId,
  "nombre": "Ana García",
  "medio": "whatsapp",
  "telefono": "+525512345678",       // uno u otro, según el medio
  "correo": null,
  "motivo": "sintomas",               // se guarda el VALOR, estable
  "estudio": "checkup",
  "plazo": "inmediato",
  "servicio": "Check-up general o preventivo (Biometría, Química, Orina)",  // etiqueta
  "origen": "beneficios",             // sección desde la que se abrió el CTA
  "consentimiento": true,
  "consentimientoAt": ISODate,        // demostrable (ver C.1)
  "sheetsOk": true,
  "sheetsError": null,
  "createdAt": ISODate,
  "ip": "…"                           // solo para rate limit
}
```

> **Guardar `value` Y `servicio` (etiqueta) no es redundante.** El valor sobrevive
> a que el administrador reformule la opción; la etiqueta es lo que el cliente
> eligió literalmente ese día, y es lo que tiene sentido en la hoja de cálculo.

Índices en `scripts/ensure-indexes.ts`:

```
leads:      { createdAt: -1 }
lead_rate:  { ip: 1 }, { expiresAt: 1 } TTL expireAfterSeconds: 0
```

### 15.8 Criterios de aceptación — Tanda 15

- [ ] **`npm run budget` sigue pasando**: el JS inicial de `/` no crece.
- [ ] El módulo del formulario se descarga **solo** al pulsar un CTA, y pesa
      < 8 KB gz (medir aparte).
- [ ] La pregunta de contacto permanece visible en los 3 pasos y conserva la
      selección al navegar.
- [ ] El campo de contacto cambia entre teléfono y correo según la preferencia,
      **sin perder** lo ya escrito en el otro.
- [ ] El botón final dice «Enviar WhatsApp» / «Enviar correo» / «Realizar
      llamada» según la opción.
- [ ] WhatsApp: abre la pestaña, limpia los campos y muestra el éxito en el modal.
- [ ] Con el bloqueador de ventanas activo, aparece el **enlace manual** en vez de
      fallar en silencio.
- [ ] Correo: llega a la dirección configurada en el Dashboard.
- [ ] Llamada: `tel:` se dispara y el número se muestra **también en texto**.
- [ ] Los tres medios crean fila en **su** pestaña, con las 6 columnas.
- [ ] Con `SHEETS_WEBHOOK_URL` vacía, el lead se guarda igual y se marca
      `sheetsOk: false`.
- [ ] Con el Apps Script caído, el visitante **no ve ningún error**.
- [ ] Token incorrecto → el Apps Script responde `{"ok":false}` y no escribe.
- [ ] Honeypot relleno → 200 y **sin** fila ni documento.
- [ ] 6 envíos desde la misma IP en 10 min → el 6.º recibe **429**.
- [ ] Sin consentimiento → **400**; el formulario no permite enviar.
- [ ] `npm run a11y:html` en 15/15 y navegación completa del formulario **solo
      con teclado**, incluido el movimiento de foco al cambiar de paso.
- [ ] **`/aviso-de-privacidad` existe y el enlace del consentimiento funciona.**

---

## Apéndice A — Riesgos identificados y mitigación

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| 1 | Atlas caído durante el build | Build falla, sin deploy | `repository` cae al `SEED`; `CONTENT_FALLBACK_TO_SEED=true`. El último `dist` sigue servido. |
| 2 | Guardados en ráfaga agotan la cuota de builds | Sin deploys hasta el reset | Debounce con claim atómico (Tanda 7.2). |
| 3 | `pending` sin drenar → cambio no publicado | Cliente ve contenido viejo | `DeployStatus` visible + botón manual; cron opcional (7.5 B). |
| 4 | Registro público abierto en producción | Cualquiera edita la landing | `ALLOW_PUBLIC_SIGNUP=false` + `SIGNUP_INVITE_CODE`. Verificado en QA. |
| 5 | `0.0.0.0/0` en Atlas | Superficie de ataque | Usuario con `readWrite` a una sola DB + password de 32+ chars. Rotar si hay incidente. |
| 6 | Deploy Hook filtrado al cliente | DoS de cuota de builds | Var sin prefijo `PUBLIC_`; `grep` del bundle en el QA. |
| 7 | Doc corrupto en `landing_sections` | Sección vacía o build roto | `safeParse` + fallback al seed + warning en el log de Vercel. |
| 8 | Embeds de Instagram | LCP y CLS destruidos | Facade con thumbnail local (Tanda 3.3). |
| 9 | `middlewareMode: 'edge'` por error | Runtime falla (mongodb no corre en Edge) | Explícito en `'classic'`, comentado en el config. |
| 10 | Mismatch de `BETTER_AUTH_URL` vs dominio | Login en loop infinito | Verificación explícita en 10.2. |
| 11 | `astro.config.mjs` no lee `.env` | `site` cae en localhost sin avisar -> canonical/OG/sitemap rotos | `process.loadEnvFile('.env')` + `throw` si falta `PUBLIC_SITE_URL` en Vercel. |
| 12 | Clase de Tailwind interpolada (`bg-${x}`) | La utilidad no se genera; el elemento queda sin color | Clases completas como string literal + `class:list`. |
| 13 | `path-to-regexp` (ReDoS, high) vía `@astrojs/vercel` -> `@vercel/routing-utils` | Nulo en runtime: solo parsea config de rutas en build, no recibe input de usuario | Aceptado. `audit fix --force` degradaría el adapter de major. Revisar en cada bump del adapter. |
| 14 | `import.meta.env` en código compartido con `scripts/` | `TypeError` al ejecutar con node | Solo `process.env`, centralizado en `src/lib/env.ts`. |
| 15 | Conexión a Mongo en el nivel superior del módulo | El `throw` del import anula el fallback a semilla | `getDb()` perezoso + cache en `globalThis`. |
| 16 | CTA final apuntando a `#agendar` (su propia sección) | Enlace muerto: el visitante no tiene cómo convertir | **PENDIENTE de input del cliente:** WhatsApp o `tel:`. Editable desde el dashboard sin tocar código. |
| 17 | Middleware corriendo en rutas prerenderizadas | Warning de Astro en build; lectura de headers inexistentes | Guarda `ctx.isPrerendered` como primera línea. |
| 18 | `getSession` lanzando por fallo de base | 500 en `/admin` en vez de redirigir | `try/catch` -> se trata como sin sesión (fail closed). |
| 19 | Open redirect vía `?redirect=` | Phishing: el usuario acaba en otro dominio tras autenticarse | `safeRedirect()` valida que sea ruta interna. 7 casos cubiertos. |
| 20 | Node local 26 vs Node 24 en Vercel | Una API solo de Node 26 rompería en producción | Hoy no se usa ninguna (`process.loadEnvFile` existe desde 20.12). Para fijarlo: `engines.node: "24.x"` en package.json. |
| 21 | `z` de `astro:schema` | Deprecado; se elimina en Astro 8 | Migrado a `astro/zod`. |
| 22 | Better Auth exige header `Origin` en POST (CSRF) | Un cliente que no lo envíe recibe 403 | Los navegadores lo envían siempre en POST. Afecta solo a pruebas con curl. |
| 23 | Editor mostrando semilla con la base caída | El editor guardaría sobre datos que no vio | La página comprueba la conexión aparte de `getSection` y avisa con `DbErrorBanner`. |
| 25 | `upsert: true` en el claim del webhook | E11000 dentro del enfriamiento — el caso común | Init con `$setOnInsert` separado del claim condicional sin upsert. |
| 28 | **Paleta entregada sin contraste AA en tema Light** | CTA principal a 3.74:1 y links a 3.49:1: ilegibles para baja visión en un sitio de salud | Bajado un paso cada familia (`#0f766e`, `#0369a1`). Auditoría automatizada en `npm run a11y:contrast`. |
| 29 | Borde de controles a 1.16:1 | Los inputs son casi invisibles (WCAG 1.4.11 pide 3:1) | `--c-border-strong` para inputs y botones con borde. |
| 38 | `public_id` con prefijo de carpeta en una cuenta con carpetas dinámicas | El reemplazo sube a la raíz y el asset de la carpeta queda intacto: el cambio no se ve | `public_id` desnudo del registro + `asset_folder` explícito. Verificado contra la cuenta. |
| 39 | `public_id` con acentos comparado en NFD | macOS produce NFD al copiar nombres; para Cloudinary es otro identificador y crearía un duplicado | Normalizar a NFC antes de comparar o enviar; `encodeURIComponent` por segmento en la URL. |
| 40 | Texto sobre la imagen de fondo de la FAQ | Invalida las 14 combinaciones AA medidas en la Tanda 9: el contraste pasa a depender de cada píxel | Scrim opaco al 92 % sobre la imagen + tarjetas con fondo opaco. Si se ve velado, desenfocar la imagen, no bajar el scrim. |
| 33 | Imágenes dentro de los repeaters de la Tanda 6 | Añadir un item crearía una ranura y alteraría el layout — lo que el requisito prohíbe | Las ranuras se declaran en **código** (`slots.ts`), no en datos. Colección `landing_images` aparte, indexada por `slotId`. |
| 34 | Validar el tipo de archivo por extensión o `Content-Type` | Ambos los controla el cliente: un `.svg` con `<script>` renombrado a `.png` pasaría | Validación por **firmas mágicas** de los bytes en el servidor. SVG excluido. |
| 35 | `public_id` aleatorio por subida | Se acumulan assets huérfanos en Cloudinary y haría falta un endpoint de borrado | `public_id` determinista por slot + `overwrite: true` + `invalidate: true`. Un asset por ranura, para siempre. |
| 36 | Guardar la URL completa de Cloudinary | Congela las transformaciones en el dato: cambiar el ancho de una tarjeta exigiría migrar documentos | Se guarda `publicId` + `version`; la URL se construye en la capa de render. |
| 37 | `CLOUDINARY_API_SECRET` con prefijo `PUBLIC_` | Cualquiera podría subir, transformar y **borrar** los assets de la cuenta | Subida solo en servidor. `preflight` ya detecta secretos con prefijo `PUBLIC_`. |
| 31 | **`astro build` NO hace type-check** | Dos errores de tipos en `deploy.ts` vivieron desde la Tanda 7 con el build en verde | `npm run check` es el chequeo real, y hay que leer la línea de errores completa, no recortar la salida. |
| 32 | Índice `[key: string]: unknown` en un doc con `$inc` | El operador no compila: el driver deriva los campos incrementables de los que TS ve numéricos | Vista tipada de la misma colección (`DeployStateDoc`). |
| 30 | `"Inter"` en el stack sin servir el archivo | El diseño cambia según las fuentes instaladas en la máquina del visitante | Stack del sistema puro, sin fuente web. |
| 27 | Proyección sin `_id: 0` | El ObjectId de cada cuenta se publica en el HTML | `projection: { _id: 0, ... }` explícito en `getUsersView`. |
| 26 | `pending: false` en la ruta de éxito del webhook | Los guardados concurrentes posteriores al claim se quedan sin publicar | La ruta de éxito no toca `pending`; el claim ya lo gestionó. |
| 24 | **Comillas arrastradas al pegar env vars en Vercel** (`"https://..."`) | Build abortado con `Invalid URL`, sin decir qué variable ni qué valor. En `BETTER_AUTH_URL` es peor: rompe las cookies en silencio | `normalizeUrlEnv` en `src/lib/env.ts` + copia en `astro.config.mjs`: quita comillas, añade protocolo, quita slash final, avisa en el log, y si sigue siendo inválido falla nombrando la variable y el valor. `.env.example` ya no usa comillas. |
| 41 | `lucide-react` importado en la landing | React entra en `/`: 1.99 KB → ~68 KB. Invalida el requisito de rendimiento | `@lucide/astro` en la landing; `lucide-react` solo en `/admin`. Test de presupuesto en CI. |
| 42 | Importar el catálogo completo (~1.600 iconos) | Build enorme; se rompe el tree-shaking | Catálogo curado con imports estáticos en `icons/catalog.ts`. |
| 43 | Nombre de icono divergente entre `@lucide/astro` y `lucide-react` | El panel muestra un hueco donde debería ir el icono | Test que verifica que todo nombre del catálogo resuelve en ambos paquetes. |
| 44 | `icon` requerido en el esquema antes de migrar | Las dos secciones dejan de validar y la landing revierte al contenido semilla | `.optional()` primero, endurecer después de la migración. |
| 45 | Colores libres rompiendo el contraste | Iconos ilegibles; se invalida la auditoría AA | Ratio en vivo en el picker + aviso bajo 3:1. No se bloquea: son decorativos. |
| 46 | Reordenar rompe la alternancia de fondos | Dos bandas `muted` contiguas | `tone` calculado por índice renderizado en `index.astro`, no dentro del componente. |
| 47 | Ocultar `hero` | La landing se queda sin `<h1>`: SEO y accesibilidad degradados | `movable: false` en el registro + normalización en el servidor. |
| 48 | Ocultar `cta_final` | Los 8 CTA apuntan a `#agendar`, que deja de existir: enlaces muertos | `movable: false`. Permitirlo exige antes dar destino alternativo a los CTA. |
| 49 | `orden` como campo independiente del índice | Dos fuentes de verdad; posiciones duplicadas tras un guardado parcial | El servidor recalcula `orden` desde el array en cada escritura. |
| 50 | Instalar el paquete `dnd-kit` (115 bytes) | No es la librería; el import falla | Usar `@hello-pangea/dnd`, o `@dnd-kit/core` + `@dnd-kit/sortable`. |
| 51 | Drag & drop como único modo de reordenar | Inutilizable con teclado o motricidad reducida | Botones ↑ ↓ obligatorios, como en `RepeaterField.tsx`. |
| 52 | Sección nueva en código ausente del documento | No se renderiza tras desplegarla | `getSectionLayout()` añade al final, visible, lo que falte. |

## Apéndice B — Lo que este plan deja fuera (por requerimiento)

Roles/permisos · 2FA · recuperación de contraseña · verificación de email · log histórico de
cambios · versionado o preview de borradores · i18n · formulario de contacto con backend ·
analytics.

> La gestión de imágenes con Cloudinary, que originalmente estaba aquí, pasó a ser la
> **Tanda 11** con arquitectura propia.

**Extensión natural futura, ya habilitada por el diseño:** `landing_sections` con
`{ status: 'draft'|'published' }` + un `?preview=token` en una ruta SSR daría vista previa sin
rebuild, reutilizando `repository` y `SectionEditor` sin cambios.

## Apéndice C — Comprobaciones automatizadas

Los criterios de aceptación de este plan son ejecutables. No se reproduce aquí su
código para que no se desincronice del repositorio:

| Comando | Qué verifica |
|---|---|
| `npm run check` | Tipos de Astro/TS. **`astro build` NO hace type-check** (riesgo 31). |
| `npm run preflight` | Entorno, Atlas, índices, contenido, cuentas y ranuras de imagen. |
| `npm run budget` | JS de `/` ≤ 2.5 KB gz y que React no se cargue (riesgo 41). |
| `npm run a11y:contrast` | Ratios WCAG de los tokens en ambos temas. |
| `npm run a11y:html` | 15 comprobaciones estructurales sobre el HTML generado. |
| `npm run check:icons` | Que cada nombre del catálogo resuelva en `@lucide/astro` y en `lucide-react` (riesgo 43). |
| `npm run db:indexes` · `db:seed` · `db:seed-images` · `db:seed-layout` · `db:seed-lead-form` · `db:migrate-icons` · `db:migrate-card-images` | Preparación y migraciones, todas idempotentes. |
| 53 | **Datos de salud sin consentimiento expreso** | Incumple la LFPDPPP: el motivo de consulta y el tipo de estudio son datos sensibles (art. 3 fr. VI) | Casilla obligatoria sin marcar por defecto + `/aviso-de-privacidad` publicado + `consentimiento` y su fecha guardados con el lead. **Bloqueante de lanzamiento.** |
| 54 | `/aviso-de-privacidad` inexistente | El footer enlaza a un 404 desde la Tanda 3, y el consentimiento apuntaría ahí | **Resuelto:** página creada con la estructura del art. 16 LFPDPPP. Los datos que solo tiene el cliente quedan como marcadores `[EN MAYÚSCULAS]` y `preflight --prod` **falla** mientras queden sin rellenar. El texto requiere revisión legal. |
| 66 | Publicar el aviso con marcadores sin rellenar | Un aviso que dice «[RAZÓN SOCIAL]» no cumple el art. 16 y el consentimiento del formulario enlaza a él | `preflight` los detecta: aviso en local, **error** con `--prod`. |
| 55 | Formulario como island de React | 1.99 KB → ~68 KB en `/`: se invalida el requisito de rendimiento | Vanilla + `import()` dinámico al primer clic en un CTA. `npm run budget` lo verifica. |
| 56 | `window.open` tras un `await` | El bloqueador lo corta: el lead se guarda pero WhatsApp no abre y el visitante cree que falló | Abrir la ventana SÍNCRONAMENTE en el clic y asignar la URL después, con enlace manual de respaldo. |
| 57 | Teléfono guardado sin formato canónico | `55 1234 5678` produce una URL de WhatsApp que no abre ningún chat: fallo silencioso que solo se nota perdiendo leads | E.164 validado con Zod; se derivan las dos formas (con `+` para `tel:`, sin él para la API). |
| 58 | Un fallo de Sheets aborta el envío | Se pierde un paciente porque una hoja de cálculo no respondió | MongoDB es la fuente de verdad; Sheets es secundario y su error se anota sin abortar. |
| 59 | Emparejar respuestas por su TEXTO | Reformular una opción rompe el histórico de leads | `value` inmutable + `label` editable, como el `imageKey` de la Tanda 13. |
| 60 | Endpoint público sin defensas | Spam, agotamiento de cuota de Web3Forms y basura en la hoja | Honeypot + tiempo mínimo + rate limit por IP con índice TTL + límite de tamaño. |
| 61 | Clave de Web3Forms en el cliente | Cualquiera envía correos con tu remitente y consume tu cuota | Envío desde el servidor; la clave vive en `.env`. |
| 62 | App web de Apps Script sin token | Está desplegada como "Cualquier persona": cualquiera escribiría en la hoja | Secreto compartido `SHEETS_WEBHOOK_TOKEN` verificado en `doPost`. |
| 63 | Editar el `.gs` sin volver a implementar | Apps Script sirve la versión desplegada, no la guardada: el cambio no surte efecto | Implementar → Gestionar implementaciones → **Nueva versión** (crear una implementación nueva cambia la URL). |
| 64 | Cliente HTTP que no sigue redirecciones | Apps Script responde 302 y el cuerpo viaja en la redirección; se interpretaría como fallo | `redirect: 'follow'` explícito y `curl -L` en la prueba. |
| 65 | `cta.mode` sin valor por defecto | Las 8 secciones dejarían de validar y se serviría el contenido semilla | `.default('link')` hasta migrar, como con `icon` en la Tanda 12. |
