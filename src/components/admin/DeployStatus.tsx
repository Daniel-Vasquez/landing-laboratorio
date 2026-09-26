import { useCallback, useEffect, useRef, useState } from 'react';
import { actions } from 'astro:actions';
import type { DeployState } from '../../lib/deploy';

/** Ventana en la que se asume que el build sigue corriendo tras dispararlo. */
const BUILD_ASSUMED_MS = 120_000;
const POLL_MS = 20_000;

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 1000));
}

export default function DeployStatus({ initial }: { initial: DeployState }) {
  const [state, setState] = useState<DeployState>(initial);
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const draining = useRef(false);

  const refresh = useCallback(async () => {
    const { data } = await actions.deploy.state();
    if (data) setState(data);
  }, []);

  const buildInFlight =
    state.lastTriggeredAt !== null &&
    now - new Date(state.lastTriggeredAt).getTime() < BUILD_ASSUMED_MS;

  const eligibleIn = secondsUntil(state.nextEligibleAt);

  /**
   * Polling ACOTADO: solo mientras hay algo que observar. Un `setInterval`
   * eterno en una pestaña abierta toda la tarde son cientos de invocaciones
   * serverless para no informar de nada.
   */
  const shouldPoll = state.enabled && (state.pending || buildInFlight);

  useEffect(() => {
    // Reloj de 1s solo cuando hay una cuenta atrás o un build en curso que mostrar.
    if (!shouldPoll) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [shouldPoll]);

  useEffect(() => {
    if (!shouldPoll) return;
    const poll = setInterval(refresh, POLL_MS);
    return () => clearInterval(poll);
  }, [shouldPoll, refresh]);

  // Hay un cambio pendiente y ya pasó el enfriamiento: publicarlo sin que el
  // editor tenga que hacer nada. El guard evita disparos duplicados si el
  // efecto se re-ejecuta antes de que termine la petición.
  useEffect(() => {
    if (!state.enabled || !state.pending || eligibleIn > 0 || draining.current) return;
    draining.current = true;
    (async () => {
      try {
        await actions.deploy.drain();
        await refresh();
      } finally {
        draining.current = false;
      }
    })();
  }, [state.enabled, state.pending, eligibleIn, refresh]);

  async function publishNow() {
    setWorking(true);
    try {
      await actions.deploy.trigger();
      await refresh();
      setNow(Date.now());
    } finally {
      setWorking(false);
    }
  }

  const tone = !state.enabled
    ? 'neutral'
    : state.lastStatus === 'error'
      ? 'error'
      : state.pending
        ? 'warn'
        : buildInFlight
          ? 'info'
          : 'ok';

  const styles = {
    neutral: 'border-border bg-surface text-fg-muted',
    ok: 'border-border bg-surface text-fg-muted',
    info: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200',
    warn: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    error: 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300',
  }[tone];

  return (
    <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border p-4 ${styles}`}>
      <span className="shrink-0" aria-hidden="true">
        {buildInFlight ? <Spinner /> : tone === 'error' ? <IconAlert /> : <IconInfo />}
      </span>

      {/* aria-live: el estado cambia sin interacción del usuario, así que un
          lector de pantalla debe anunciarlo. `polite` para no interrumpir. */}
      <p aria-live="polite" className="min-w-0 flex-1 text-sm">
        {!state.enabled ? (
          <>
            <strong className="font-semibold">Redespliegue automático desactivado.</strong>{' '}
            Los cambios se guardan, pero la web pública no se actualizará hasta que se configure{' '}
            <code className="font-mono text-xs">VERCEL_DEPLOY_HOOK_URL</code>.
          </>
        ) : state.lastStatus === 'error' ? (
          <>
            <strong className="font-semibold">No se pudo iniciar el redespliegue.</strong>{' '}
            Tus cambios están guardados, pero la web pública sigue mostrando la versión anterior.
            <span className="mt-1 block font-mono text-xs opacity-80">{state.lastError}</span>
          </>
        ) : state.pending ? (
          <>
            <strong className="font-semibold">Cambios pendientes de publicar.</strong>{' '}
            {eligibleIn > 0
              ? `Se publicarán automáticamente en ${eligibleIn}s, o púlsalo ahora.`
              : 'Publicando…'}
          </>
        ) : buildInFlight ? (
          <>
            <strong className="font-semibold">Publicando los cambios…</strong> La web pública se
            actualizará en un par de minutos. Puedes cerrar esta página.
          </>
        ) : (
          <>
            Al guardar, la web se redesplegará automáticamente.{' '}
            {state.lastTriggeredAt && (
              <span className="opacity-80">
                Última publicación:{' '}
                {new Intl.DateTimeFormat('es-MX', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'America/Mexico_City',
                }).format(new Date(state.lastTriggeredAt))}
                .
              </span>
            )}
          </>
        )}
      </p>

      {state.enabled && (
        <button
          type="button"
          onClick={publishNow}
          disabled={working}
          aria-busy={working}
          className="shrink-0 rounded-lg border border-current/30 px-3.5 py-2 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {working ? 'Publicando…' : state.lastStatus === 'error' ? 'Reintentar' : 'Publicar ahora'}
        </button>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
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
