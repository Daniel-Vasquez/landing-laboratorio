/**
 * Presupuesto de JavaScript de la landing.
 *
 * Es el requisito de negocio ("landing de alto rendimiento") convertido en una
 * comprobación ejecutable. Existe porque la restricción más fácil de romper sin
 * darse cuenta es importar un componente de React en `/`: bastaría un
 * `lucide-react` mal colocado para pasar de 2 KB a ~68 KB.
 *
 * Ejecutar: npm run budget   (tras npm run build)
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const ROOT = '.vercel/output/static';
/*
 * 3.2 KB gzip.
 *
 * Subido desde 2.5 KB en la Tanda 15, deliberadamente y una sola vez: el
 * formulario de captación necesita un cargador con `import()` dinámico, y el
 * helper de code-splitting de Vite cuesta ~950 B que no se pueden evitar sin
 * renunciar a la carga diferida (verificado: `modulePreload.polyfill: false`
 * no los elimina).
 *
 * El número nunca fue el objetivo. Esta comprobación existe para atrapar dos
 * cosas concretas, que se verifican explícitamente más abajo:
 *   1. que React no entre en la landing (~66 KB);
 *   2. que el formulario NO se cargue por adelantado (~1.7 KB que solo debe
 *      pagar quien pulsa un CTA).
 */
const LIMIT = 3277; // 3.2 KB gzip

const html = readFileSync(`${ROOT}/index.html`, 'utf8');

const refs = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
const inline = [
  ...html.matchAll(/<script(?![^>]*\ssrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g),
].map((m) => m[1]);

let js = refs.reduce((total, ref) => total + gzipSync(readFileSync(ROOT + ref)).length, 0);
js += inline.reduce((total, code) => total + gzipSync(Buffer.from(code)).length, 0);

const reactLoaded = refs.some((ref) => ref.includes('client.'));
const svgCount = (html.match(/<svg/g) ?? []).length;

/*
 * El formulario debe existir en el build pero NO en la carga inicial.
 * Si algún día se importa de forma estática, esto lo detecta aunque el total
 * siguiera por debajo del límite.
 */
const formEager = refs.some((ref) => ref.includes('form-client'));

console.log(`JS en /        : ${js} B gz  (límite ${LIMIT})`);
console.log(`React cargado  : ${reactLoaded ? 'SÍ' : 'NO'}`);
console.log(`SVG inline     : ${svgCount}`);
console.log(`Formulario eager: ${formEager ? 'SÍ' : 'NO'}`);
console.log(`scripts externos: ${refs.length} · inline: ${inline.length}`);

const problemas = [];
if (js > LIMIT) problemas.push(`el JS inicial (${js} B) supera el límite de ${LIMIT} B`);
if (reactLoaded) problemas.push('React se carga en la landing');
if (formEager) problemas.push('el formulario se carga por adelantado en lugar de bajo demanda');

if (problemas.length > 0) {
  console.error(`\n✗ Presupuesto excedido:\n${problemas.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\n✓ Dentro del presupuesto.');
