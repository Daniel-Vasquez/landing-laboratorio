/**
 * Verifica que cada nombre del catálogo exista en LOS DOS paquetes.
 *
 * La landing usa `@lucide/astro` y el panel `lucide-react`. Un nombre presente
 * solo en uno no rompe el build: deja un hueco silencioso donde debería estar el
 * icono, en la landing o en el selector. Esta comprobación lo convierte en un
 * fallo ruidoso.
 *
 * Ejecutar: npm run check:icons
 */
import { existsSync } from 'node:fs';
import { ICON_NAMES } from '../src/lib/icons/names.ts';
import { toPascalCase } from '../src/lib/icons/react-catalog.ts';
import * as Lucide from 'lucide-react';

const missing: string[] = [];

for (const name of ICON_NAMES) {
  const inAstro = existsSync(`node_modules/@lucide/astro/src/icons/${name}.ts`);
  const inReact = typeof (Lucide as Record<string, unknown>)[toPascalCase(name)] !== 'undefined';
  if (!inAstro || !inReact) {
    missing.push(
      `${name.padEnd(22)} @lucide/astro: ${inAstro ? 'ok' : 'FALTA'} · lucide-react (${toPascalCase(name)}): ${inReact ? 'ok' : 'FALTA'}`,
    );
  }
}

console.log(`Catálogo de iconos: ${ICON_NAMES.length} nombres`);
if (missing.length > 0) {
  console.error(`\n✗ ${missing.length} no resuelven en ambos paquetes:\n`);
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}
console.log('✓ Todos resuelven en @lucide/astro y en lucide-react.');
