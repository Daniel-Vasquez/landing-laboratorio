import { useCallback, useEffect, useRef, useState } from 'react';
import { actions } from 'astro:actions';
import type { DeployState } from '../../lib/deploy';

/**
 * Cuánto se muestra el acuse de "publicación solicitada" antes de ocultarse.
 *
 * Es un ACUSE, no un indicador de progreso. El dashboard dispara un Deploy Hook
 * y no tiene ningún canal de vuelta desde Vercel, así que no puede saber en qué
 * segundo termina el build. Fingir que lo sigue —con un spinner que duraba dos
 * minutos— hacía parecer que el proceso estaba colgado cuando Vercel ya había
 * terminado.
 */
const ACK_MS = 4500;

/** Refresco del estado mientras hay un cambio pendiente de publicar. */
const POLL_MS = 20_000;

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso));
}

export default function DeployStatus({ initial }: { initial: DeployState }) {
  const [state, setState] = useState<DeployState>(initial);
  const [working, setWorking] = useState(false);
  /**
   * Acuse efímero, SOLO de cliente. No se deriva de `state.lastTriggeredAt`
   * a propósito: si lo hiciera, recargar /admin dentro de la ventana volvería
   * a mostrarlo, aunque el build ya hubiera acabado.
   */
  const [ack, setAck] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const draining = useRef(false);

  const refresh = useCallback(async () => {
    const { data } = await actions.deploy.state();
    if (data) setState(data);
  }, []);

  const eligibleIn = secondsUntil(state.nextEligibleAt);
  const hasPending = state.enabled && state.pending;

  // --- Auto-descarte del acuse -------------------------------------------
  useEffect(() => {
    if (!ack) return;
    const timer = setTimeout(() => setAck(null), ACK_MS);
    // Limpieza obligatoria: si el componente se desmonta (o llega otro acuse)
    // antes de que venza, el temporizador quedaría suelto.
    return () => clearTimeout(timer);
  }, [ack]);

  // --- Cuenta atrás: solo mientras haya algo pendiente que contar ---------
  useEffect(() => {
    if (!hasPending) return;
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(clock);
  }, [hasPending]);

  // --- Polling ACOTADO a lo pendiente ------------------------------------
  useEffect(() => {
    if (!hasPending) return;
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [hasPending, refresh]);

  // --- Drenaje automático al vencer el enfriamiento -----------------------
  useEffect(() => {
    if (!hasPending || eligibleIn > 0 || draining.current) return;
    draining.current = true;
    (async () => {
      try {
        const { data } = await actions.deploy.drain();
        if (data && 'triggered' in data && data.triggered) {
          setAck('Cambios pendientes enviados a publicar.');
        }
        await refresh();
      } finally {
        draining.current = false;
      }
    })();
    // `tick` entra como dependencia para reevaluar `eligibleIn` cada segundo.
  }, [hasPending, eligibleIn, tick, refresh]);

  async function publishNow() {
    setWorking(true);
    try {
      const { data } = await actions.deploy.trigger();
      if (data?.ok) {
        setAck('Publicación solicitada. La web tardará un par de minutos en reflejarlo.');
      }
      await refresh();
    } finally {
      // Siempre en `finally`: un fallo de red no debe dejar el botón
      // deshabilitado ni con el texto de carga.
      setWorking(false);
    }
  }

  // --- Qué mostrar. Orden de prioridad deliberado ------------------------
  const view = !state.enabled
    ? {
        tone: 'neutral' as const,
        body: (
          <>
            <strong className="font-semibold">Redespliegue automático desactivado.</strong>{' '}
            Los cambios se guardan, pero la web pública no se actualizará hasta que se configure{' '}
            <code className="font-mono text-xs">VERCEL_DEPLOY_HOOK_URL</code>.
          </>
        ),
      }
    : state.lastStatus === 'error'
      ? {
          tone: 'error' as const,
          body: (
            <>
              <strong className="font-semibold">No se pudo iniciar el redespliegue.</strong> Tus
              cambios están guardados, pero la web pública sigue mostrando la versión anterior.
              <span className="mt-1 block font-mono text-xs opacity-80">{state.lastError}</span>
            </>
          ),
        }
      : hasPending
        ? {
            tone: 'warn' as const,
            body: (
              <>
                <strong className="font-semibold">Cambios pendientes de publicar.</strong>{' '}
                {eligibleIn > 0
                  ? `Se enviarán automáticamente en ${eligibleIn}s, o púlsalo ahora.`
                  : 'Enviando…'}
              </>
            ),
          }
        : ack
          ? { tone: 'success' as const, body: <strong className="font-semibold">{ack}</strong> }
          : {
              tone: 'neutral' as const,
              body: (
                <>
                  Al guardar, la web se redesplegará automáticamente.{' '}
                  {state.lastTriggeredAt && (
                    /* Sin punto final: `es-MX` formatea la hora como "10:16 p.m."
                       y añadir otro produciría "p.m..". */
                    <span className="opacity-80">
                      Última publicación: {formatWhen(state.lastTriggeredAt)}
                    </span>
                  )}
                </>
              ),
            };

  const styles = {
    neutral: 'border-border bg-surface text-fg-muted',
    success: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    error: 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300',
  }[view.tone];

  return (
    <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${styles}`}>
      <span className="shrink-0" aria-hidden="true">
        {view.tone === 'success' ? <IconCheck /> : view.tone === 'error' ? <IconAlert /> : <IconInfo />}
      </span>

      {/* El estado cambia sin interacción del usuario, así que un lector de
          pantalla debe anunciarlo. `polite` para no interrumpir. */}
      <p aria-live="polite" className="min-w-0 flex-1 text-sm">
        {view.body}
      </p>

      {state.enabled && (
        <button
          type="button"
          onClick={publishNow}
          disabled={working}
          aria-busy={working}
          className="shrink-0 rounded-lg border border-current/30 px-3.5 py-2 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {working
            ? 'Enviando…'
            : state.lastStatus === 'error'
              ? 'Reintentar'
              : 'Publicar ahora'}
        </button>
      )}
    </div>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01" />
    </svg>
  );
}
