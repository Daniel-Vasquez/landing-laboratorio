/**
 * Valida el parámetro `?redirect=` antes de usarlo.
 *
 * Sin esta validación, `/login?redirect=https://malicioso.example` produciría
 * un open redirect: tras autenticarse, el usuario acabaría en un dominio ajeno
 * con la confianza de venir del sitio real. Solo se aceptan rutas internas.
 */
export function safeRedirect(raw: string | null, fallback = '/admin'): string {
  if (!raw) return fallback;

  // Debe empezar por una sola "/": "//host" es un URL protocol-relative.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  // "\" es tratado como "/" por algunos navegadores.
  if (raw.includes('\\')) return fallback;

  return raw;
}
