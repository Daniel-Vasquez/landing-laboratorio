import type { APIRoute } from 'astro';
import { leadPayloadSchema } from '../../lib/leads/schemas.ts';
import {
  checkRateLimit,
  getLeadFormConfig,
  optionLabel,
  saveLead,
  type LeadRecord,
} from '../../lib/leads/repository.ts';
import { logLeadToSheets } from '../../lib/leads/sheets.ts';
import { sendLeadEmail } from '../../lib/leads/web3forms.ts';

export const prerender = false;

/** Tiempo mínimo con el formulario abierto. Por debajo, es un bot. */
const MIN_FILL_MS = 3000;
const MAX_BODY_BYTES = 8 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // 1. Tamaño. Un cuerpo enorme se rechaza antes de parsearlo.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'Solicitud demasiado grande.' }, 413);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo inválido.' }, 400);
  }

  // 2. Validación. Mismo Zod que usaría una action del panel.
  const parsed = leadPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: 'Revisa los datos del formulario.',
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400,
    );
  }
  const lead = parsed.data;

  /*
   * 3. Honeypot y tiempo mínimo.
   *
   * Se responde 200 fingiendo éxito, NO un error. Un bot que recibe un 400
   * aprende qué campo lo delató y ajusta el siguiente intento; uno que recibe
   * 200 cree haber tenido éxito y no vuelve.
   */
  const esBot = Boolean(lead.empresa) || (lead.ms !== undefined && lead.ms < MIN_FILL_MS);
  if (esBot) return json({ ok: true, medio: lead.medio, descartado: true });

  // 4. Rate limit por IP.
  const ip = clientAddress ?? '';
  try {
    const { allowed } = await checkRateLimit(ip);
    if (!allowed) {
      return json(
        { ok: false, error: 'Demasiados envíos seguidos. Inténtalo de nuevo en unos minutos.' },
        429,
      );
    }
  } catch {
    // Si el rate limit falla, se deja pasar: preferimos un lead de más a
    // rechazar a un paciente real por un fallo de infraestructura.
  }

  // 5. Configuración: destinos de contacto y etiquetas.
  const config = await getLeadFormConfig();
  if (!config.ready) {
    return json(
      { ok: false, error: 'El formulario no está disponible ahora mismo. Llámanos o escríbenos.' },
      503,
    );
  }

  const etiquetas = {
    motivo: optionLabel(config, 'motivo', lead.motivo),
    estudio: optionLabel(config, 'estudio', lead.estudio),
    plazo: optionLabel(config, 'plazo', lead.plazo),
  };

  const ahora = new Date();
  const telefono = lead.medio === 'correo' ? null : (lead.telefono ?? '').replace(/\D/g, '');
  const correo = lead.medio === 'correo' ? (lead.correo ?? '').trim() : null;

  // 6. Registro en Sheets. Su fallo NO aborta: es un registro secundario.
  const sheets = await logLeadToSheets({
    nombre: lead.nombre,
    correo: correo ?? '',
    telefono: telefono ?? '',
    servicio: etiquetas.estudio,
    medio: lead.medio,
    fecha: ahora.toISOString(),
  });

  // 7. Persistencia propia: la fuente de verdad.
  const record: LeadRecord = {
    nombre: lead.nombre,
    medio: lead.medio,
    telefono,
    correo,
    motivo: lead.motivo,
    estudio: lead.estudio,
    plazo: lead.plazo,
    motivoLabel: etiquetas.motivo,
    estudioLabel: etiquetas.estudio,
    plazoLabel: etiquetas.plazo,
    origen: lead.origen ?? '',
    consentimiento: true,
    // Guardar CUÁNDO consintió: un consentimiento que no se puede demostrar
    // no existe a efectos prácticos (LFPDPPP art. 8).
    consentimientoAt: ahora,
    sheetsOk: sheets.ok,
    sheetsError: sheets.error,
    createdAt: ahora,
    ip: ip || null,
  };

  try {
    await saveLead(record);
  } catch (error) {
    console.error('[leads] No se pudo guardar el lead:', error);
    return json({ ok: false, error: 'No pudimos registrar tu solicitud. Inténtalo de nuevo.' }, 500);
  }

  // 8. Entrega según el medio.
  if (lead.medio === 'correo') {
    try {
      await sendLeadEmail({
        destino: config.contacto.correo,
        nombre: lead.nombre,
        correo: correo ?? '',
        motivo: etiquetas.motivo,
        estudio: etiquetas.estudio,
        plazo: etiquetas.plazo,
        origen: record.origen,
      });
    } catch (error) {
      console.error('[leads] Web3Forms falló:', error);
      // Aquí SÍ se informa: el correo ERA la entrega.
      return json(
        { ok: false, error: 'No pudimos enviar tu correo. Inténtalo por WhatsApp o llámanos.' },
        502,
      );
    }
    return json({ ok: true, medio: 'correo' });
  }

  if (lead.medio === 'llamada') {
    return json({
      ok: true,
      medio: 'llamada',
      telUrl: `tel:${config.contacto.telefono}`,
      telefono: config.contacto.telefono,
    });
  }

  // WhatsApp: la API exige el número SIN `+`, sin espacios ni guiones.
  const destino = config.contacto.whatsapp.replace(/\D/g, '');
  const mensaje = [
    'Hola, quiero agendar estudios de laboratorio.',
    '',
    `Nombre: ${lead.nombre}`,
    `Motivo: ${etiquetas.motivo}`,
    `Estudio: ${etiquetas.estudio}`,
    `Cuándo: ${etiquetas.plazo}`,
  ].join('\n');

  return json({
    ok: true,
    medio: 'whatsapp',
    waUrl: `https://api.whatsapp.com/send?phone=${destino}&text=${encodeURIComponent(mensaje)}`,
  });
};
