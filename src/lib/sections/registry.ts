import type { SectionKey } from '../content/schemas.ts';

/**
 * Registro CERRADO de secciones renderizables.
 *
 * `landing_config` guarda QUÉ ORDEN y QUÉ VISIBILIDAD. Qué secciones existen,
 * con qué componente y qué ancla, sigue viviendo en código: mismo principio que
 * `images/slots.ts` y `icons/names.ts`.
 *
 * `seo` y `avisos` NO están aquí: no son secciones visuales. La primera alimenta
 * el <head> y la segunda el <footer>, y ambos se renderizan siempre.
 */
export type SectionDefinition = {
  key: SectionKey;
  /** Ancla del <section>. La usan el menú y los CTA. */
  anchor: string;
  /** Título por defecto en el menú; el panel puede sobrescribirlo. */
  defaultMenuTitle: string;
  /** `false` = no se puede mover ni ocultar. Ver la nota de abajo. */
  movable: boolean;
  /** Aparece en el menú de navegación cuando está visible. */
  inMenu: boolean;
};

/**
 * DOS SECCIONES SON FIJAS, y no por preferencia:
 *
 * `hero` contiene el único <h1> de la página. Moverlo rompe la jerarquía de
 * encabezados que verifica `npm run a11y:html`, y ocultarlo deja la landing SIN
 * <h1>, degradando SEO y accesibilidad a la vez. Además es el LCP: su imagen es
 * la única con `fetchpriority="high"`.
 *
 * `cta_final` contiene el ancla `#agendar`, a la que apuntan los 8 CTA de la
 * landing. Ocultarla convertiría los ocho botones en enlaces muertos: el
 * visitante pulsa "Agenda tu estudio" y no pasa nada. Permitirlo exigiría antes
 * dar a los CTA un destino alternativo (WhatsApp o tel:), que es trabajo aparte.
 */
const REGISTRY = [
  { key: 'hero',                 anchor: 'inicio',      defaultMenuTitle: 'Inicio',             movable: false, inMenu: false },
  { key: 'estudios_principales', anchor: 'estudios',    defaultMenuTitle: 'Estudios',           movable: true,  inMenu: true  },
  { key: 'por_que_estudios',     anchor: 'por-que',     defaultMenuTitle: '¿Por qué estudios?', movable: true,  inMenu: true  },
  { key: 'estudios_adicionales', anchor: 'adicionales', defaultMenuTitle: 'Adicionales',        movable: true,  inMenu: true  },
  { key: 'por_que_hospital',     anchor: 'beneficios',  defaultMenuTitle: 'Beneficios',         movable: true,  inMenu: true  },
  // `inMenu: false` replica el menú hardcodeado original, que tenía 5 entradas.
  // Testimonios y Videos se renderizan pero no aparecían en la navegación;
  // ponerlos en `true` los añade sin más cambios.
  { key: 'testimonios',          anchor: 'testimonios', defaultMenuTitle: 'Testimonios',        movable: true,  inMenu: false },
  { key: 'videos',               anchor: 'videos',      defaultMenuTitle: 'Videos',             movable: true,  inMenu: false },
  { key: 'faq',                  anchor: 'faq',         defaultMenuTitle: 'Preguntas',          movable: true,  inMenu: true  },
  { key: 'cta_final',            anchor: 'agendar',     defaultMenuTitle: 'Agenda',             movable: false, inMenu: false },
] as const satisfies readonly SectionDefinition[];

/**
 * `satisfies` en lugar de una anotación de tipo: comprueba la forma PERO
 * conserva los literales de `key`. Con `: readonly SectionDefinition[]` el tipo
 * se ensancharía a las 11 claves de contenido, incluidas `seo` y `avisos`, que
 * no tienen componente — y el mapa de `index.astro` dejaría de tipar.
 */
export const SECTION_REGISTRY: readonly SectionDefinition[] = REGISTRY;

/** Solo las 9 secciones con componente. Excluye `seo` y `avisos`. */
export type RenderableKey = (typeof REGISTRY)[number]['key'];

export const RENDERABLE_KEYS = REGISTRY.map((s) => s.key) as RenderableKey[];

export function getDefinition(key: string): SectionDefinition | undefined {
  return SECTION_REGISTRY.find((s) => s.key === key);
}

export function isRenderableKey(value: unknown): value is RenderableKey {
  return typeof value === 'string' && REGISTRY.some((s) => s.key === value);
}
