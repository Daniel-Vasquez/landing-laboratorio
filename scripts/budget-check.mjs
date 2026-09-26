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
const LIMIT = 2560; // 2.5 KB gzip

const html = readFileSync(`${ROOT}/index.html`, 'utf8');

const refs = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map((m) => m[1]);
const inline = [
  ...html.matchAll(/<script(?![^>]*\ssrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g),
].map((m) => m[1]);

let js = refs.reduce((total, ref) => total + gzipSync(readFileSync(ROOT + ref)).length, 0);
js += inline.reduce((total, code) => total + gzipSync(Buffer.from(code)).length, 0);

const reactLoaded = refs.some((ref) => ref.includes('client.'));
const svgCount = (html.match(/<svg/g) ?? []).length;

console.log(`JS en /        : ${js} B gz  (límite ${LIMIT})`);
console.log(`React cargado  : ${reactLoaded ? 'SÍ' : 'NO'}`);
console.log(`SVG inline     : ${svgCount}`);
console.log(`scripts externos: ${refs.length} · inline: ${inline.length}`);

if (js > LIMIT || reactLoaded) {
  console.error(
    '\n✗ Presupuesto excedido. Lo más probable: entró un componente de React en la landing.',
  );
  process.exit(1);
}
console.log('\n✓ Dentro del presupuesto.');
