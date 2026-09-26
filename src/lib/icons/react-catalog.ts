import * as Lucide from 'lucide-react';
import type { ComponentType } from 'react';
import { ICON_META, ICON_NAMES, type IconName } from './names.ts';

/**
 * Equivalentes de React del catálogo. SOLO lo importa el dashboard.
 *
 * NO se pueden reutilizar los componentes de `catalog.ts`: son `.astro` y React
 * no los puede renderizar. Lo que se comparte entre ambos mundos son los
 * NOMBRES y las etiquetas, no los componentes.
 *
 * Este módulo nunca debe alcanzar la landing: arrastraría `lucide-react` y con
 * él React entero (~66 KB gz) a una página que hoy sirve 2 KB de JavaScript.
 * `npm run budget` falla si eso ocurre.
 */
type LucideComponent = ComponentType<{
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean;
}>;

/** `heart-pulse` -> `HeartPulse`, que es como `lucide-react` exporta. */
export function toPascalCase(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

const registry = Lucide as unknown as Record<string, LucideComponent | undefined>;

export const REACT_ICONS: Record<IconName, LucideComponent> = Object.fromEntries(
  ICON_NAMES.map((name) => [name, registry[toPascalCase(name)]]).filter(
    (entry): entry is [IconName, LucideComponent] => Boolean(entry[1]),
  ),
) as Record<IconName, LucideComponent>;

/** Nombre + etiqueta + sinónimos, para alimentar el buscador del panel. */
export const ICON_OPTIONS = ICON_NAMES.filter((name) => REACT_ICONS[name]).map((name) => ({
  name,
  label: ICON_META[name].label,
  tags: ICON_META[name].tags,
}));
