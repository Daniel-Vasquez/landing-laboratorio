import { intEnv, optionalEnv } from './env.ts';
import { getDeployStateCollection } from './mongo.ts';

/**
 * Disparo del Deploy Hook de Vercel con ventana de enfriamiento.
 *
 * EL PROBLEMA: la landing es estática, así que un cambio de contenido solo se
 * publica con un rebuild. Pero disparar un build por cada guardado significa que
 * un editor tocando 6 secciones seguidas lanza 6 builds: consume cuota, y los
 * builds concurrentes pueden terminar fuera de orden y publicar contenido viejo.
 *
 * LA SOLUCIÓN: se reserva el turno de disparo con UNA operación atómica de
 * MongoDB. Si otro guardado ya disparó dentro de la ventana, este se marca como
 * `pending` y lo publicará el siguiente disparo elegible (automático desde el
 * dashboard, o manual con "Publicar ahora").
 */

const DEPLOY_STATE_ID = 'deploy_state';

export type DeployResult =
  | { ok: true; triggered: true; at: string }
  | { ok: true; triggered: false; reason: 'cooldown' | 'disabled'; nextEligibleAt: string | null }
  | { ok: false; error: string };

export type DeployState = {
  lastTriggeredAt: string | null;
  pending: boolean;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  cooldownSeconds: number;
  nextEligibleAt: string | null;
  /** `false` cuando VERCEL_DEPLOY_HOOK_URL está vacía (desarrollo local, previews). */
  enabled: boolean;
};

function cooldownMs(): number {
  return intEnv('DEPLOY_HOOK_COOLDOWN_SECONDS', 90) * 1000;
}

function hookUrl(): string | undefined {
  return optionalEnv('VERCEL_DEPLOY_HOOK_URL');
}

/**
 * Crea el documento de estado si no existe.
 *
 * Separado del claim a propósito. Hacer `findOneAndUpdate` con filtro
 * condicional Y `upsert: true` parece más corto, pero cuando el filtro no
 * coincide (es decir, DENTRO del cooldown — el caso común) MongoDB intenta
 * insertar un documento con un `_id` que ya existe y lanza E11000. Verificado.
 */
async function ensureState(): Promise<void> {
  const meta = await getDeployStateCollection();
  try {
    await meta.updateOne(
      { _id: DEPLOY_STATE_ID },
      {
        $setOnInsert: {
          lastTriggeredAt: null,
          pending: false,
          lastStatus: null,
          lastError: null,
          triggerCount: 0,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // Dos peticiones concurrentes pueden intentar el insert a la vez; la
    // perdedora recibe E11000 y puede ignorarlo: el documento ya existe.
    if ((error as { code?: number })?.code !== 11000) throw error;
  }
}

async function postHook(url: string, reason: string, actorName: string): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // El body es opcional para Vercel; sirve de rastro en el log del hook.
    body: JSON.stringify({ reason, actor: actorName }),
    // Sin timeout, un hook que no responde bloquearía la función serverless
    // hasta su maxDuration y el editor vería la UI colgada.
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`El hook respondió ${response.status}. ${body.slice(0, 200)}`);
  }
}

export async function triggerDeploy(options: {
  reason: string;
  actor: { name: string };
  /** Salta la ventana de enfriamiento. Solo para el botón "Publicar ahora". */
  force?: boolean;
}): Promise<DeployResult> {
  const url = hookUrl();

  // Sin hook configurado NO es un error: permite desarrollar en local y
  // desplegar previews sin disparar builds de producción.
  if (!url) {
    return { ok: true, triggered: false, reason: 'disabled', nextEligibleAt: null };
  }

  try {
    await ensureState();
    const meta = await getDeployStateCollection();
    const now = new Date();
    const cutoff = new Date(now.getTime() - cooldownMs());

    // RESERVA ATÓMICA DEL TURNO. El filtro condicional y la escritura ocurren
    // en una sola operación de MongoDB: un `find` seguido de un `update` sería
    // una race condition y dos guardados simultáneos dispararían dos builds.
    const claim = options.force
      ? await meta.findOneAndUpdate(
          { _id: DEPLOY_STATE_ID },
          { $set: { lastTriggeredAt: now, pending: false }, $inc: { triggerCount: 1 } },
          { returnDocument: 'after' },
        )
      : await meta.findOneAndUpdate(
          {
            _id: DEPLOY_STATE_ID,
            $or: [{ lastTriggeredAt: { $lte: cutoff } }, { lastTriggeredAt: null }],
          },
          { $set: { lastTriggeredAt: now, pending: false }, $inc: { triggerCount: 1 } },
          { returnDocument: 'after' },
        );

    if (!claim) {
      // Dentro del cooldown: se marca pendiente para que no se pierda el cambio.
      const current = await meta.findOneAndUpdate(
        { _id: DEPLOY_STATE_ID },
        { $set: { pending: true } },
        { returnDocument: 'after' },
      );
      const last = current?.lastTriggeredAt;
      return {
        ok: true,
        triggered: false,
        reason: 'cooldown',
        nextEligibleAt: last ? new Date(last.getTime() + cooldownMs()).toISOString() : null,
      };
    }

    try {
      await postHook(url, options.reason, options.actor.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // El turno ya se consumió, pero el disparo falló: se deja `pending` para
      // que el siguiente intento (o el botón manual) lo reintente.
      await meta.updateOne(
        { _id: DEPLOY_STATE_ID },
        { $set: { lastStatus: 'error', lastError: message, pending: true } },
      );
      return { ok: false, error: message };
    }

    /**
     * NO se toca `pending` aquí. El claim ya lo puso en false, y entre el claim
     * y este punto otro guardado concurrente puede haberlo puesto en true.
     *
     * Ponerlo en false de nuevo sería una race condition con consecuencia real:
     * el build arranca cuando se llama al hook, así que los guardados que
     * todavía no habían llegado a MongoDB NO entran en esa compilación. Borrar
     * su marca de pendiente los dejaría sin publicar nunca.
     */
    await meta.updateOne(
      { _id: DEPLOY_STATE_ID },
      { $set: { lastStatus: 'ok', lastError: null } },
    );
    return { ok: true, triggered: true, at: now.toISOString() };
  } catch (error) {
    // NUNCA propagar: el guardado de contenido no debe fallar porque el
    // redespliegue falle. El contenido ya está en MongoDB y esto es reintentable.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getDeployState(): Promise<DeployState> {
  const seconds = cooldownMs() / 1000;
  const enabled = Boolean(hookUrl());

  try {
    await ensureState();
    const meta = await getDeployStateCollection();
    const doc = await meta.findOne({ _id: DEPLOY_STATE_ID });
    const last = doc?.lastTriggeredAt ?? null;

    return {
      lastTriggeredAt: last ? last.toISOString() : null,
      pending: Boolean(doc?.pending),
      lastStatus: doc?.lastStatus ?? null,
      lastError: doc?.lastError ?? null,
      cooldownSeconds: seconds,
      nextEligibleAt: last ? new Date(last.getTime() + cooldownMs()).toISOString() : null,
      enabled,
    };
  } catch (error) {
    return {
      lastTriggeredAt: null,
      pending: false,
      lastStatus: 'error',
      lastError: error instanceof Error ? error.message : String(error),
      cooldownSeconds: seconds,
      nextEligibleAt: null,
      enabled,
    };
  }
}
