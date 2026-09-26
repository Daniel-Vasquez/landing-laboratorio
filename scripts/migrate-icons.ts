/**
 * Asigna icono y colores a las tarjetas que aún no lo tienen.
 *
 * Los beneficios y las categorías ya existen sin `icon`: hasta ahora su icono
 * estaba escrito dentro del componente. Esta migración lo convierte en dato,
 * eligiendo el equivalente más cercano al que se venía mostrando.
 *
 * Reglas, iguales a las de `seed-images.ts`:
 *   - emparejar por TÍTULO normalizado, no por posición: reordenar desde el
 *     panel no debe reasignar iconos;
 *   - no tocar un item que ya tenga `icon`: la elección del administrador manda;
 *   - idempotente.
 *
 * Ejecutar: npm run db:migrate-icons
 */
import { getSectionsCollection, closeMongo } from '../src/lib/mongo.ts';
import { isIconName, type IconName } from '../src/lib/icons/names.ts';

/** Token `--c-primary` del tema light y su tinte al 10 % sobre blanco. */
const COLOR = '#0f766e';
const BACKGROUND = '#e7f4f3';

const normalize = (text: string) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Beneficios: replican los 6 `path` SVG que vivían en PorQueHospital.astro. */
const BENEFICIOS: Record<string, IconName> = {
  'resultados el mismo dia': 'clock',
  'precision en cada resultado': 'shield-check',
  'precios accesibles': 'badge-dollar-sign',
  'mas de 200 estudios disponibles': 'list-checks',
  'sin complicaciones': 'sparkles',
  'dentro del hospital': 'hospital',
};

/** Categorías: el componente repetía un solo icono; aquí cada una recibe el suyo. */
const CATEGORIAS: Record<string, IconName> = {
  'check ups completos': 'package',
  'perfiles prenatales': 'baby',
  'perfiles tiroideos': 'brain',
  'perfiles hepaticos': 'flask-conical',
  'perfiles renales': 'droplet',
  'perfiles hormonales': 'activity',
  'perfiles ginecologicos': 'venus',
  cultivos: 'bug',
  'marcadores tumorales': 'ribbon',
  'pruebas covid': 'shield-alert',
  antidoping: 'scan-line',
};

type Target = {
  section: string;
  path: string;
  titleField: string;
  map: Record<string, IconName>;
  fallback: IconName;
  /**
   * `null` = icono suelto, sin pastilla.
   *
   * Respeta el diseño previo: "¿Por qué en Hospital Cristal?" mostraba el icono
   * dentro de un cuadro tintado, y "Estudios adicionales" lo mostraba suelto
   * junto al título. Poner fondo en ambos cambiaría el segundo de un icono de
   * 20 px a una pastilla de 44 px y alteraría la altura de las 11 tarjetas.
   */
  background: string | null;
};

const TARGETS: Target[] = [
  { section: 'por_que_hospital', path: 'beneficios', titleField: 'titulo', map: BENEFICIOS, fallback: 'circle-check', background: BACKGROUND },
  { section: 'estudios_adicionales', path: 'items', titleField: 'titulo', map: CATEGORIAS, fallback: 'clipboard-list', background: null },
];

const run = async () => {
  const collection = await getSectionsCollection();

  for (const target of TARGETS) {
    const doc = await collection.findOne({ _id: target.section as never });
    if (!doc) {
      console.log(`  ✗ sección "${target.section}" no existe`);
      continue;
    }

    const data = doc.data as Record<string, unknown>;
    const items = data[target.path] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(items)) continue;

    console.log(`\nSección "${target.section}" · ${items.length} item(s)\n`);
    let assigned = 0;
    let kept = 0;

    const next = items.map((item) => {
      if (item.icon && isIconName((item.icon as { name?: unknown })?.name)) {
        kept++;
        console.log(`  = ${String(item[target.titleField])} (ya tiene icono)`);
        return item;
      }
      const title = normalize(String(item[target.titleField] ?? ''));
      const name = target.map[title] ?? target.fallback;
      assigned++;
      console.log(`  + ${String(item[target.titleField]).padEnd(34)} -> ${name}`);
      return { ...item, icon: { name, color: COLOR, background: target.background } };
    });

    await collection.updateOne(
      { _id: target.section as never },
      { $set: { [`data.${target.path}`]: next } },
    );
    console.log(`\n  asignados: ${assigned} · conservados: ${kept}`);
  }

  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
