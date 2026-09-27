/**
 * Verificación previa al despliegue.
 *
 * Comprueba lo que un build verde NO garantiza: que las variables de entorno
 * sean coherentes entre sí, que Atlas responda con los índices y el contenido
 * esperados, y que no se vaya a producción con el registro abierto o con el
 * Deploy Hook apuntando a la rama equivocada.
 *
 *   npm run preflight            (usa .env local)
 *   npm run preflight -- --prod  (exige lo que producción necesita)
 *
 * Salida: código 1 si hay errores, 0 si solo hay avisos.
 */
import { normalizeUrlEnv } from '../src/lib/env.ts';

const PROD = process.argv.includes('--prod');

try {
  process.loadEnvFile('.env');
} catch {
  // En Vercel no hay .env; las variables ya están en process.env.
}

const errors = [];
const warns = [];
const oks = [];

const ok = (m) => oks.push(m);
const warn = (m) => warns.push(m);
const err = (m) => errors.push(m);

// ---------------------------------------------------------------- entorno ---
function requiredVars() {
  const required = [
    'MONGODB_URI',
    'MONGODB_DB_NAME',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'PUBLIC_SITE_URL',
  ];
  for (const key of required) {
    const value = process.env[key];
    if (!value) err(`Falta ${key}.`);
    else if (/^["']|["']$/.test(value.trim()))
      warn(`${key} lleva comillas en el valor. Funciona (se normaliza) pero en Vercel va sin ellas.`);
  }
  if (required.every((k) => process.env[k])) ok('Las 5 variables obligatorias están definidas.');
}

function urlConsistency() {
  const site = process.env.PUBLIC_SITE_URL;
  const auth = process.env.BETTER_AUTH_URL;
  if (!site || !auth) return;

  let normSite, normAuth;
  try {
    normSite = normalizeUrlEnv('PUBLIC_SITE_URL', site);
    normAuth = normalizeUrlEnv('BETTER_AUTH_URL', auth);
  } catch (e) {
    err(e.message);
    return;
  }

  if (normSite !== normAuth) {
    // Este es el fallo que produce un login en bucle sin ningún mensaje útil.
    err(
      `PUBLIC_SITE_URL y BETTER_AUTH_URL no coinciden:\n` +
        `      PUBLIC_SITE_URL -> ${normSite}\n` +
        `      BETTER_AUTH_URL -> ${normAuth}\n` +
        `      Deben ser idénticas o las cookies de sesión se rechazan (login en bucle).`,
    );
  } else {
    ok(`PUBLIC_SITE_URL y BETTER_AUTH_URL coinciden (${normSite}).`);
  }

  if (PROD && normSite.startsWith('http://')) {
    err(`En producción PUBLIC_SITE_URL debe ser https:// (es ${normSite}).`);
  }
}

function secretStrength() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return;
  if (secret.length < 32)
    err(`BETTER_AUTH_SECRET tiene ${secret.length} caracteres; usa 32+ (openssl rand -base64 32).`);
  else if (/reemplaza|change|example|secret/i.test(secret))
    err('BETTER_AUTH_SECRET parece ser el valor de ejemplo. Genera uno real.');
  else ok(`BETTER_AUTH_SECRET tiene longitud suficiente (${secret.length}).`);
}

function noPublicSecrets() {
  const leaked = Object.keys(process.env).filter(
    (k) =>
      k.startsWith('PUBLIC_') &&
      /SECRET|PASSWORD|TOKEN|MONGODB_URI|HOOK/i.test(k),
  );
  if (leaked.length) err(`Variables con prefijo PUBLIC_ que NO deberían tenerlo: ${leaked.join(', ')}`);
  else ok('Ningún secreto lleva prefijo PUBLIC_ (no llegan al navegador).');
}

function cloudinary() {
  const required = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_FOLDER',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    err(
      `Faltan variables de Cloudinary: ${missing.join(', ')}. ` +
        'El BUILD las necesita para construir las URLs de las imágenes, no solo el panel.',
    );
    return;
  }
  if (process.env.CLOUDINARY_FOLDER !== 'landing-laboratorio') {
    warn(
      `CLOUDINARY_FOLDER es "${process.env.CLOUDINARY_FOLDER}"; las ranuras esperan ` +
        '"landing-laboratorio".',
    );
  }
  ok('Las 4 variables de Cloudinary están definidas.');
}

function signupGate() {
  const open = process.env.ALLOW_PUBLIC_SIGNUP === 'true';
  const invite = process.env.SIGNUP_INVITE_CODE;
  if (open && PROD && !invite)
    err(
      'ALLOW_PUBLIC_SIGNUP=true en producción sin código de invitación: cualquiera puede ' +
        'crear una cuenta y editar la web. Ponlo en false tras crear las cuentas del equipo.',
    );
  else if (open && PROD) warn('Registro abierto en producción, protegido solo por el código de invitación.');
  else if (open) warn('Registro abierto (aceptable en local; ciérralo antes de producción).');
  else ok('Registro público cerrado.');
}

function deployHook() {
  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  const env = process.env.VERCEL_ENV;

  if (env === 'preview' && hook) {
    // El hook apunta a `main`: un preview de otra rama publicaría producción.
    err(
      'VERCEL_DEPLOY_HOOK_URL está definida en el entorno Preview. Debe estar VACÍA ahí: ' +
        'el hook apunta a main, así que un preview de otra rama publicaría producción.',
    );
    return;
  }
  if (PROD && !hook) {
    warn(
      'VERCEL_DEPLOY_HOOK_URL vacía: los cambios se guardarán pero la web pública NO se ' +
        'actualizará sola. Créalo en Vercel -> Settings -> Git -> Deploy Hooks.',
    );
    return;
  }
  if (hook && !/^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//.test(hook))
    warn(`VERCEL_DEPLOY_HOOK_URL no tiene la forma esperada de un Deploy Hook de Vercel.`);
  else if (hook) ok('Deploy Hook configurado.');
  else ok('Deploy Hook vacío (correcto en local y en Preview).');
}

// ------------------------------------------------------------ base de datos ---
async function database() {
  if (!process.env.MONGODB_URI || !process.env.MONGODB_DB_NAME) return;

  let mongo, schemas;
  try {
    mongo = await import('../src/lib/mongo.ts');
    schemas = await import('../src/lib/content/schemas.ts');
  } catch (e) {
    err(`No se pudieron cargar los módulos de datos: ${e.message}`);
    return;
  }

  let db;
  try {
    db = await mongo.getDb();
    ok(`Conexión a MongoDB correcta (base "${db.databaseName}").`);
  } catch (e) {
    err(
      `No se pudo conectar a MongoDB: ${e.message}\n` +
        '      Revisa la contraseña en MONGODB_URI y Network Access 0.0.0.0/0 en Atlas.',
    );
    return;
  }

  // Índices
  const expected = {
    user: ['email_1'],
    session: ['token_1', 'expiresAt_1'],
    account: ['userId_1'],
  };
  for (const [coll, names] of Object.entries(expected)) {
    let have = [];
    try {
      have = (await db.collection(coll).indexes()).map((i) => i.name);
    } catch {
      /* colección inexistente todavía */
    }
    const missing = names.filter((n) => !have.includes(n));
    if (missing.length) warn(`Índices ausentes en "${coll}": ${missing.join(', ')}. Corre npm run db:indexes.`);
  }
  if (!warns.some((w) => w.includes('Índices ausentes'))) ok('Índices presentes.');

  // Contenido
  const docs = await db.collection('landing_sections').find({}).toArray();
  const byKey = new Map(docs.map((d) => [d._id, d.data]));
  const missing = schemas.SECTION_KEYS.filter((k) => !byKey.has(k));
  const invalid = schemas.SECTION_KEYS.filter(
    (k) => byKey.has(k) && !schemas.SECTION_SCHEMAS[k].safeParse(byKey.get(k)).success,
  );

  if (missing.length) err(`Secciones ausentes en la base: ${missing.join(', ')}. Corre npm run db:seed.`);
  if (invalid.length)
    err(
      `Secciones que NO validan: ${invalid.join(', ')}. La landing las sustituirá por el ` +
        'contenido semilla y el build lo registrará como warning.',
    );
  if (!missing.length && !invalid.length)
    ok(`Las ${schemas.SECTION_KEYS.length} secciones existen y validan.`);

  // Imágenes
  try {
    const slots = await import('../src/lib/images/slots.ts');
    const rows = await db.collection('landing_images').find({}, { projection: { _id: 1 } }).toArray();
    const have = new Set(rows.map((r) => r._id));
    const without = slots.IMAGE_SLOTS.filter((s) => !have.has(s.id)).map((s) => s.id);

    // Ranuras de tarjeta: se derivan del contenido, no del registro.
    const cards = await import('../src/lib/images/cards.ts');
    let cardTotal = 0;
    for (const group of cards.CARD_IMAGE_GROUPS) {
      const section = await db.collection('landing_sections').findOne({ _id: group.section });
      const items = section?.data?.[group.path];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        cardTotal++;
        const title = String(item?.[group.titleField] ?? '(sin título)');
        if (typeof item?.imageKey !== 'string') {
          without.push(`${title} (sin imageKey: guarda la sección)`);
        } else if (!have.has(cards.cardSlotKey(group, item.imageKey))) {
          without.push(`${title} (tarjeta sin imagen)`);
        }
      }
    }

    const total = slots.IMAGE_SLOTS.length + cardTotal;
    if (without.length) {
      warn(`Ranuras sin imagen (renderizarán placeholder): ${without.join(', ')}`);
    } else {
      ok(`Las ${total} ranuras de imagen tienen asset (${slots.IMAGE_SLOTS.length} fijas + ${cardTotal} de tarjeta).`);
    }
  } catch (e) {
    warn(`No se pudieron comprobar las ranuras de imagen: ${e.message}`);
  }

  // Formulario de captación
  try {
    const doc = await db.collection('landing_config').findOne({ _id: 'lead_form' });
    if (!doc) {
      warn('No existe la configuración del formulario. Corre npm run db:seed-lead-form.');
    } else {
      const c = doc.contacto ?? {};
      const faltan = ['whatsapp', 'telefono', 'correo'].filter((k) => !c[k]);
      if (faltan.length) {
        warn(
          `El formulario no puede enviar: faltan destinos de contacto (${faltan.join(', ')}). ` +
            'Rellénalos en /admin/formulario.',
        );
      } else {
        ok('Destinos de contacto del formulario configurados.');
      }
    }
  } catch (e) {
    warn(`No se pudo comprobar el formulario: ${e.message}`);
  }

  // Cuentas
  const users = await db.collection('user').countDocuments();
  if (users === 0)
    warn(
      'No hay ninguna cuenta. Nadie podrá entrar al panel: activa ALLOW_PUBLIC_SIGNUP=true, ' +
        'regístrate en /registro, y vuelve a cerrarlo.',
    );
  else ok(`${users} cuenta(s) con acceso al panel.`);

  await mongo.closeMongo();
}

// ------------------------------------------------------------------ salida ---
requiredVars();
urlConsistency();
secretStrength();
noPublicSecrets();
signupGate();
cloudinary();
deployHook();
await database();

const label = PROD ? 'PRODUCCIÓN' : 'local';
console.log(`\nPreflight (${label})\n${'─'.repeat(60)}`);
for (const m of oks) console.log(`  ✓ ${m}`);
for (const m of warns) console.log(`  ! ${m}`);
for (const m of errors) console.log(`  ✗ ${m}`);
console.log(
  `${'─'.repeat(60)}\n  ${oks.length} correctas · ${warns.length} avisos · ${errors.length} errores\n`,
);
if (errors.length) {
  console.log('  No despliegues hasta resolver los errores.\n');
  process.exitCode = 1;
}
