# Planificador — Iconos dinámicos y Reordenamiento de secciones

> Complementa a `planificacion.md` (Tandas 1–11, ya implementadas). Este documento
> cubre **dos funcionalidades nuevas**, numeradas como **Tanda 12** y **Tanda 13**
> para no colisionar con la numeración existente.
>
> Cada Tanda es ejecutable de forma independiente y cierra con criterios verificables.
> **No avanzar a la siguiente sin cumplir los criterios de la anterior.**

---

## 0. Estado actual y restricciones que NO se pueden romper

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

# TANDA 12 — Selector dinámico de iconos SVG

**Objetivo:** que el administrador elija el icono y sus colores para cada tarjeta
de `¿Por qué en Hospital Cristal?` y `Estudios adicionales`, sin que la landing
gane un solo byte de JavaScript.

## 12.1 Elección de librería: DOS paquetes, no uno

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

## 12.2 Registro de iconos permitidos — `src/lib/icons/catalog.ts`

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

## 12.3 Esquema en MongoDB — `src/lib/content/schemas.ts`

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

## 12.4 Render en la landing — `src/components/landing/Icon.astro`

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

## 12.5 UI del panel — Popover de selección

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

## 12.6 Migración — `scripts/migrate-icons.ts`

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

## 12.7 Criterios de aceptación — Tanda 12

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

# TANDA 13 — Reordenamiento y visibilidad de secciones

**Objetivo:** que el administrador reordene y oculte secciones de la landing, y que
el menú se genere desde ese mismo orden.

## 13.1 Modelo de datos — colección `landing_config`

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

## 13.2 Registro de secciones — `src/lib/sections/registry.ts`

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

### 13.2.1 Dos secciones quedan fijas, y hay que explicar por qué

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

## 13.3 Lectura y validación — `src/lib/sections/repository.ts`

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

## 13.4 Render en la landing — `src/pages/index.astro`

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

### 13.4.1 La alternancia de fondos se rompe al reordenar

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

### 13.4.2 Props heterogéneas

Los componentes no comparten firma: `CtaFinal` recibe `address`, `Hero` no recibe
`images` de tarjeta, etc. Dos opciones:

- **(a) Uniformar las props** de los nueve a `{ data, images, tone, content }`.
  Más refactor, pero el bucle queda limpio y tipado.
- **(b)** Un `switch` en el bucle que construya las props por sección.

**Recomendada: (a).** El bucle es el punto donde el tipado se pierde con más
facilidad; uniformar las firmas es lo que permite que TypeScript siga verificando
el render dinámico.

## 13.5 Menú dinámico — `src/lib/nav.ts`

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

## 13.6 UI del panel — Drag & Drop

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

## 13.7 Migración — `scripts/seed-section-layout.ts`

Crea el documento con el orden **actual** de `index.astro`, para que la primera
ejecución no altere nada de lo que el cliente ve hoy.

```bash
npm run db:seed-layout
```

`$setOnInsert`: correrlo de nuevo no pisa la configuración del administrador.

## 13.8 Criterios de aceptación — Tanda 13

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

## Apéndice — Riesgos nuevos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
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

## Apéndice — Test de presupuesto (criterio 12.7)

Guardar como `scripts/budget-check.mjs` y añadir `npm run budget`:

```js
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = '.vercel/output/static';
const html = readFileSync(`${root}/index.html`, 'utf8');
const refs = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

let js = refs.reduce((n, r) => n + gzipSync(readFileSync(root + r)).length, 0);
js += inline.reduce((n, c) => n + gzipSync(Buffer.from(c)).length, 0);

const reactLoaded = refs.some((r) => r.includes('client.'));
const LIMIT = 2560; // 2.5 KB

console.log(`JS en / : ${js} B gz (límite ${LIMIT}) · React: ${reactLoaded ? 'SÍ' : 'NO'}`);
if (js > LIMIT || reactLoaded) {
  console.error('✗ Presupuesto excedido. Revisa si entró un componente de React en la landing.');
  process.exit(1);
}
```
