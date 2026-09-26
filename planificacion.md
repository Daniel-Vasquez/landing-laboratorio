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

> Contraste: `#0d9488` sobre blanco = 3.9:1 → **no usar como texto pequeño**, solo como fondo
> de botón con texto blanco (4.6:1) o en texto ≥ 18.66px bold. Para links en cuerpo de texto
> usar `--color-accent` (`#0284c7` sobre `#fafafa` = 4.6:1 ✓ AA).

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
  - Éxito → toast "Guardado · redeploy iniciado", reset de `isDirty`, refresco de `DeployStatus`.
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
4. Persistir `lastStatus`, `lastError`, `lastResponse.job.id` si viene.
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
- **B (robusta, recomendada):** `src/pages/api/cron/drain-deploy.ts` (`prerender = false`),
  protegido por header `Authorization: Bearer ${CRON_SECRET}`, que si `pending===true` y pasó
  el cooldown, dispara. Registrado en `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/drain-deploy", "schedule": "*/10 * * * *" }] }
  ```
  Vercel envía el header `Authorization: Bearer <CRON_SECRET>` automáticamente si la var existe.
  Plan Hobby permite crons con granularidad diaria; `*/10` requiere plan Pro — verificar el plan
  antes de elegir B.

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
escritura futura queda auditada por construcción.

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

Proyección de Mongo explícita: `find({}, { projection: { name:1, email:1, createdAt:1 } })`.
**Nunca** traer el documento completo de `user` a la vista.

### 8.3 Criterios de aceptación Tanda 8

- [ ] Usuario A guarda el Hero → `/admin/usuarios` muestra "A", la hora correcta y "Hero".
- [ ] Usuario B guarda FAQ → la card muestra a B (reemplaza a A, no acumula).
- [ ] Base sin cambios registrados → estado vacío, sin excepción.
- [ ] La lista de cuentas no expone `password`, `providerId` ni `_id` en el HTML servido.
- [ ] Zona horaria correcta: guardar a las 23:30 CDMX no muestra la fecha del día siguiente.

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

- **Fuentes:** `Inter` autoalojada en `/public/fonts/` (subset `latin` + `latin-ext` para
  acentos y "ñ"), `woff2`, `font-display: swap`, `<link rel="preload" as="font" crossorigin>`
  solo para el peso 400 y 700. **No** usar Google Fonts (RTT extra + privacidad).
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
- [ ] `axe DevTools` en `/` y en `/admin/contenido/hero`: 0 violaciones críticas o serias.
- [ ] Lighthouse mobile en `/` (producción): Performance ≥ 95, A11y 100, Best Practices ≥ 95, SEO 100.
- [ ] 11 intentos de login en 60 s → el 11.º devuelve 429.
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

> **`VERCEL_DEPLOY_HOOK_URL` vacía en Preview es obligatorio.** El hook apunta a `main`:
> si un preview de una rama lo dispara, publica producción desde otra rama. Bug silencioso y grave.

> **`BETTER_AUTH_URL` en Preview:** los dominios de preview son aleatorios. Usar
> `https://${VERCEL_URL}` resuelto en `astro.config.mjs`/`auth.ts`, o aceptar que el login no
> funcione en previews (aceptable si el QA de auth se hace en producción).

### 10.2 Dominio

Subdominio ya configurado → asignarlo al proyecto, verificar SSL activo, y confirmar que
`PUBLIC_SITE_URL` / `BETTER_AUTH_URL` coinciden **exactamente** (con `https://`, **sin** slash final).
Un mismatch rompe `trustedOrigins` y las cookies de sesión.

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

## Apéndice B — Lo que este plan deja fuera (por requerimiento)

Roles/permisos · 2FA · recuperación de contraseña · verificación de email · log histórico de
cambios · versionado o preview de borradores · subida de imágenes desde el dashboard ·
i18n · formulario de contacto con backend · analytics.

**Extensión natural futura, ya habilitada por el diseño:** `landing_sections` con
`{ status: 'draft'|'published' }` + un `?preview=token` en una ruta SSR daría vista previa sin
rebuild, reutilizando `repository` y `SectionEditor` sin cambios.
