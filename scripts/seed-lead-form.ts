/**
 * Crea la configuración del formulario y pone los 8 CTA en modo formulario.
 *
 * Los contactos se dejan VACÍOS a propósito: un número de ejemplo en producción
 * enviaría pacientes a un desconocido. `npm run preflight` avisa hasta que se
 * rellenen desde el panel.
 *
 * `$setOnInsert` para la configuración: correrlo de nuevo no pisa lo que el
 * administrador haya editado.
 *
 * Ejecutar: npm run db:seed-lead-form
 */
import { getDb, getSectionsCollection, closeMongo } from '../src/lib/mongo.ts';
import { QUESTIONS } from '../src/lib/leads/questions.ts';
import { DEFAULT_TEXTS, EMPTY_CONTACT } from '../src/lib/leads/repository.ts';

const run = async () => {
  const db = await getDb();

  const preguntas = Object.fromEntries(
    QUESTIONS.map((question) => [
      question.id,
      { label: question.defaultLabel, options: question.defaultOptions.map((o) => ({ ...o })) },
    ]),
  );

  const result = await db.collection('landing_config').updateOne(
    { _id: 'lead_form' as never },
    {
      $setOnInsert: {
        contacto: { ...EMPTY_CONTACT },
        preguntas,
        textos: { ...DEFAULT_TEXTS },
        updatedAt: new Date(),
        updatedBy: null,
      },
    },
    { upsert: true },
  );

  console.log(
    result.upsertedCount > 0
      ? `Configuración creada con ${QUESTIONS.length} preguntas.`
      : 'La configuración ya existía, sin cambios.',
  );

  // Los 8 CTA pasan a abrir el formulario. Solo se toca el que no tenga `mode`:
  // una decisión previa del administrador manda.
  const sections = await getSectionsCollection();
  let updated = 0;
  for (const doc of await sections.find({}).toArray()) {
    const data = doc.data as Record<string, unknown>;
    const cta = data?.cta as Record<string, unknown> | undefined;
    if (!cta || typeof cta.mode === 'string') continue;
    await sections.updateOne(
      { _id: doc._id },
      { $set: { 'data.cta.mode': 'form' } },
    );
    updated++;
    console.log(`  + ${doc._id} -> cta.mode = "form"`);
  }
  console.log(`\nCTA actualizados: ${updated}`);

  await closeMongo();
};

run().catch(async (error) => {
  console.error('\n✗ Error:', error instanceof Error ? error.message : error);
  await closeMongo();
  process.exit(1);
});
