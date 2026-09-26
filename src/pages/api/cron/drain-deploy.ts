import type { APIRoute } from 'astro';
import { optionalEnv } from '../../../lib/env.ts';
import { getDeployState, triggerDeploy } from '../../../lib/deploy.ts';

export const prerender = false;

/**
 * Publica un cambio que quedó pendiente cuando nadie tiene el dashboard abierto.
 *
 * Caso que cubre: un editor guarda dentro de la ventana de enfriamiento y cierra
 * el navegador de inmediato. El cambio queda `pending` y, sin esto, esperaría al
 * siguiente guardado para publicarse.
 *
 * NO está registrado en vercel.json a propósito: los crons con granularidad
 * menor que diaria requieren plan Pro, y un cron diario dejaría un cambio sin
 * publicar hasta 24 h, que es peor que no tenerlo. Para activarlo con plan Pro:
 *
 *   { "crons": [{ "path": "/api/cron/drain-deploy", "schedule": "*\/10 * * * *" }] }
 *
 * Vercel envía `Authorization: Bearer $CRON_SECRET` automáticamente cuando esa
 * variable existe en el proyecto.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = optionalEnv('CRON_SECRET');

  // Sin secreto configurado el endpoint queda cerrado. Abierto permitiría a
  // cualquiera disparar builds y agotar la cuota.
  if (!secret) {
    return Response.json(
      { ok: false, error: 'CRON_SECRET no está configurado; el endpoint está deshabilitado.' },
      { status: 503 },
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const state = await getDeployState();

  if (!state.enabled) {
    return Response.json({ ok: true, triggered: false, reason: 'disabled' });
  }
  if (!state.pending) {
    return Response.json({ ok: true, triggered: false, reason: 'nothing-pending' });
  }

  // Sin `force`: si el enfriamiento no ha pasado, se deja para la próxima pasada.
  const result = await triggerDeploy({
    reason: 'cron:drain-pending',
    actor: { name: 'Cron de Vercel' },
  });

  return Response.json(result, { status: result.ok ? 200 : 502 });
};
