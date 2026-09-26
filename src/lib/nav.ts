export type NavItem = { label: string; href: string };

/**
 * Anclas de la landing. Los `href` deben coincidir con los `id` que emiten
 * los componentes de sección (Tanda 3).
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Estudios', href: '#estudios' },
  { label: '¿Por qué estudios?', href: '#por-que' },
  { label: 'Adicionales', href: '#adicionales' },
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Preguntas', href: '#faq' },
];

export const NAV_CTA: NavItem = { label: 'Agenda tu estudio', href: '#agendar' };
