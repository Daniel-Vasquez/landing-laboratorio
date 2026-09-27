import type { ResolvedSection } from './sections/repository.ts';

export type NavItem = { label: string; href: string };

/**
 * El menú ya NO está hardcodeado: se deriva del mismo orden que dicta MongoDB.
 *
 * Se omiten las secciones ocultas (su ancla no existe en el HTML, así que el
 * enlace sería muerto) y las marcadas `inMenu: false` — el hero, al que ya
 * lleva el logo, y el CTA final, al que apuntan los 8 botones.
 */
export function buildNavItems(layout: ResolvedSection[]): NavItem[] {
  return layout
    .filter((section) => section.visible && section.inMenu)
    .map((section) => ({ label: section.menuTitle, href: `#${section.anchor}` }));
}

export const NAV_CTA: NavItem = { label: 'Agenda tu estudio', href: '#agendar' };
