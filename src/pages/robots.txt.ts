import type { APIRoute } from 'astro';

export const prerender = true;

/**
 * El dashboard y la API no deben indexarse nunca. `Disallow` evita el rastreo;
 * AdminLayout añade además `noindex,nofollow` (defensa en profundidad: robots.txt
 * no impide la indexación de una URL enlazada desde fuera).
 */
export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL('sitemap-index.xml', site).href : '';

  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /login',
    'Disallow: /registro',
    '',
    sitemap ? `Sitemap: ${sitemap}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return new Response(`${body}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
