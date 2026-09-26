/**
 * Ratio de contraste WCAG 2.2.
 *
 * Misma fórmula que `scripts/contrast-audit.mjs`, extraída aquí para que el
 * selector de iconos pueda mostrar el ratio en vivo sin duplicar el cálculo.
 */

/** `#0f766e` -> [r, g, b] normalizados a 0..1. */
function channels(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function linearize(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Normaliza a `#rrggbb` en minúsculas, que es lo que valida el esquema Zod. */
export function normalizeHex(value: string): string {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return withHash.toLowerCase();
}
