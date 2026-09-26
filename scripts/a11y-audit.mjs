/**
 * Auditoría estructural de accesibilidad sobre el HTML generado.
 * No sustituye a axe DevTools ni a la prueba con teclado; cubre los errores
 * mecánicos que sí se pueden verificar en CI.
 */
import { readFileSync } from 'node:fs';

const html = readFileSync('.vercel/output/static/index.html', 'utf8');
const checks = [];
const add = (label, ok, detail = '') => checks.push({ label, ok, detail });

// --- estructura ---
add('lang declarado', /<html[^>]*lang="es-MX"/.test(html));
add('un solo <h1>', (html.match(/<h1[\b >]/g) ?? []).length === 1,
  `encontrados: ${(html.match(/<h1[\b >]/g) ?? []).length}`);

// Jerarquía sin saltos: recolectar niveles en orden de aparición.
const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
let jumps = [];
for (let i = 1; i < levels.length; i++) {
  if (levels[i] > levels[i - 1] + 1) jumps.push(`h${levels[i - 1]} -> h${levels[i]}`);
}
add('jerarquía de headings sin saltos', jumps.length === 0, jumps.join(', '));

add('skip link presente', html.includes('href="#contenido"'));
add('<main> presente', /<main[\s>]/.test(html));
add('landmark de navegación', /<nav[^>]*aria-label=/.test(html));
add('footer presente', /<footer[\s>]/.test(html));

// --- imágenes ---
const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
add('todas las <img> tienen alt', imgs.every((t) => /\balt=/.test(t)), `${imgs.length} imágenes`);
add('todas las <img> tienen width y height (CLS)',
  imgs.every((t) => /\bwidth=/.test(t) && /\bheight=/.test(t)), `${imgs.length} imágenes`);

// --- controles ---
const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
const unnamed = buttons.filter(([full, inner]) =>
  !/aria-label=/.test(full) && inner.replace(/<[^>]+>/g, '').trim() === '');
add('ningún <button> sin nombre accesible', unnamed.length === 0, `${unnamed.length} sin nombre`);

// Enlaces que abren en pestaña nueva deben avisarlo
const blanks = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>([\s\S]*?)<\/a>/g)];
const unwarned = blanks.filter(([, inner]) => !/sr-only/.test(inner));
add('enlaces target=_blank avisan al lector de pantalla',
  unwarned.length === 0, `${blanks.length} enlaces externos, ${unwarned.length} sin aviso`);
add('enlaces target=_blank llevan rel=noopener',
  blanks.every(([full]) => /rel="[^"]*noopener/.test(full)));

// --- SVG decorativos ocultos ---
const svgs = [...html.matchAll(/<svg\b[^>]*>/g)].map((m) => m[0]);
const exposedSvgs = svgs.filter((t) => !/aria-hidden="true"/.test(t) && !/role="img"/.test(t));
add('SVG decorativos con aria-hidden', exposedSvgs.length === 0,
  `${svgs.length} svg, ${exposedSvgs.length} expuestos`);

// --- acordeón nativo ---
add('FAQ usa <details> nativo (funciona sin JS)', html.includes('<details'));

// --- indexación ---
add('la landing NO lleva noindex', !/<meta[^>]*name="robots"[^>]*noindex/.test(html));

let pass = 0;
for (const c of checks) {
  if (c.ok) pass++;
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.detail ? `  (${c.detail})` : ''}`);
}
console.log(`\n  ${pass}/${checks.length} comprobaciones`);
if (pass !== checks.length) process.exitCode = 1;
