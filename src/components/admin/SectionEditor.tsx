import { useEffect, useId, useMemo, useState, type SubmitEvent } from 'react';
import { actions, isActionError, isInputError } from 'astro:actions';
import type { SectionKey } from '../../lib/content/schemas';
import type { DeployResult } from '../../lib/deploy';
import { FIELD_MAP, type Field } from './fieldMap';
import { deepClone, getPath, setPath } from './paths';
import RepeaterField from './RepeaterField';
import { CharCounter, FieldShell, inputClass } from './fields';

type Status = { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: string };

type Toast = {
  tone: 'success' | 'warn' | 'error';
  message: string;
  /** Cambia en cada aviso para reiniciar el temporizador de autocierre. */
  id: number;
};

/** Cuánto permanece visible el aviso de éxito antes de desaparecer. */
const TOAST_MS = 6000;

/** Lo que devuelve `triggerDeploy` a través de la action. */
type DeployOutcome = DeployResult;

interface Props {
  sectionKey: SectionKey;
  initialData: unknown;
}

export default function SectionEditor({ sectionKey, initialData }: Props) {
  /**
   * `pristine` es la última versión CONFIRMADA por el servidor, y es estado,
   * no un `useMemo` sobre `initialData`.
   *
   * Que fuera un memo causaba el diálogo nativo "Reload site? Changes you made
   * may not be saved": tras guardar con éxito, `pristine` seguía siendo el dato
   * original, así que `isDirty` seguía en `true`, el listener `beforeunload`
   * seguía montado, y la recarga que se hacía a continuación lo disparaba.
   * Los datos ya estaban guardados; la alerta era una falsa alarma.
   */
  const [pristine, setPristine] = useState<unknown>(() => deepClone(initialData));
  const [data, setData] = useState<unknown>(() => deepClone(initialData));
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [toast, setToast] = useState<Toast | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const baseId = useId();

  const fields = FIELD_MAP[sectionKey];
  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(pristine),
    [data, pristine],
  );

  // El aviso de éxito se cierra solo; los de error se quedan hasta el siguiente
  // intento, porque exigen una acción del usuario.
  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Avisar antes de perder cambios al cerrar la pestaña o navegar fuera.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  function update(path: string, value: unknown) {
    setData((current: unknown) => setPath(current, path, value));
    setFieldErrors((current) => {
      if (!current[path]) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
    // Editar tras un guardado deja obsoleto el aviso de éxito.
    setToast((current) => (current?.tone === 'success' ? null : current));
  }

  /**
   * Traduce el resultado del webhook a un mensaje honesto.
   *
   * No se anuncia "la landing se está actualizando" salvo que el redespliegue
   * se haya disparado de verdad: con el hook sin configurar, dentro de la
   * ventana de enfriamiento, o si el hook falló, esa frase sería falsa y el
   * editor esperaría un cambio en la web pública que no va a llegar.
   */
  function describeDeploy(deploy: DeployOutcome): Toast {
    const id = Date.now();
    if (!deploy.ok) {
      return {
        id,
        tone: 'error',
        message:
          'Cambios guardados correctamente, pero no se pudo iniciar el redespliegue. ' +
          'La web pública sigue mostrando la versión anterior: usa "Publicar ahora" en el panel.',
      };
    }
    if (deploy.triggered) {
      return {
        id,
        tone: 'success',
        message: 'Cambios guardados correctamente. La landing se está actualizando.',
      };
    }
    if (deploy.reason === 'cooldown') {
      return {
        id,
        tone: 'success',
        message:
          'Cambios guardados correctamente. Se publicarán junto con los anteriores en unos segundos.',
      };
    }
    return {
      id,
      tone: 'warn',
      message:
        'Cambios guardados correctamente, pero el redespliegue automático está desactivado, ' +
        'así que la web pública no se actualizará todavía.',
    };
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    // Impide el envío nativo del formulario: la petición va por la action.
    event.preventDefault();

    setStatus({ state: 'saving' });
    setFieldErrors({});
    setToast(null);

    // Instantánea de lo enviado: `data` puede cambiar mientras la petición
    // vuela, y `pristine` debe reflejar exactamente lo que el servidor aceptó.
    const submitted = deepClone(data);

    const { data: result, error } = await actions.content.updateSection({
      key: sectionKey,
      data: submitted,
    });

    if (error) {
      if (isActionError(error) && error.code === 'UNAUTHORIZED') {
        // La sesión murió. Único caso en que se navega: hay que reautenticar.
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      // isInputError -> falló el esquema del INPUT de la action (key/data).
      const message = isInputError(error)
        ? 'Los datos enviados no tienen el formato esperado.'
        : error.message;

      setStatus({ state: 'error', message });
      setToast({ id: Date.now(), tone: 'error', message });
      return;
    }

    /**
     * Sin `window.location.reload()`.
     *
     * Se adopta lo que el servidor confirmó como nueva línea base: `isDirty`
     * pasa a false, el guard de `beforeunload` se desmonta, y los campos ya
     * muestran los valores guardados porque `data` nunca se descartó.
     */
    setPristine(submitted);
    setStatus({ state: 'idle' });
    setToast(describeDeploy(result.deploy));
  }

  function renderField(field: Field, absolutePath = field.path): React.ReactNode {
    const id = `${baseId}-${absolutePath}`;
    const error = fieldErrors[absolutePath];

    if (field.kind === 'repeater') {
      const items = (getPath(data, absolutePath) as unknown[]) ?? [];
      return (
        <RepeaterField
          key={absolutePath}
          field={field}
          items={items}
          onChange={(next) => update(absolutePath, next)}
          renderItemField={(sub, subPath) => renderField(sub, subPath)}
        />
      );
    }

    if (field.kind === 'list') {
      const items = (getPath(data, absolutePath) as string[]) ?? [];
      const atMax = items.length >= field.max;
      return (
        <fieldset key={absolutePath}>
          <legend className="text-sm font-medium text-fg">
            {field.label}{' '}
            <span className="font-normal text-fg-muted">
              ({items.length}/{field.max})
            </span>
          </legend>
          {field.hint && <p className="mt-1 text-xs text-fg-muted">{field.hint}</p>}

          <ul className="mt-3 space-y-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-2.5 w-5 shrink-0 text-right font-mono text-xs text-fg-muted">
                  {index + 1}
                </span>
                {field.itemKind === 'textarea' ? (
                  <textarea
                    id={`${id}-${index}`}
                    aria-label={`${field.itemLabel} ${index + 1}`}
                    rows={3}
                    value={item}
                    maxLength={field.itemMax}
                    onChange={(e) =>
                      update(
                        absolutePath,
                        items.map((v, i) => (i === index ? e.target.value : v)),
                      )
                    }
                    className={inputClass(false)}
                  />
                ) : (
                  <input
                    id={`${id}-${index}`}
                    type="text"
                    aria-label={`${field.itemLabel} ${index + 1}`}
                    value={item}
                    maxLength={field.itemMax}
                    onChange={(e) =>
                      update(
                        absolutePath,
                        items.map((v, i) => (i === index ? e.target.value : v)),
                      )
                    }
                    className={inputClass(false)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => update(absolutePath, items.filter((_, i) => i !== index))}
                  aria-label={`Eliminar ${field.itemLabel.toLowerCase()} ${index + 1}`}
                  className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => update(absolutePath, [...items, ''])}
            disabled={atMax}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {atMax ? `Máximo ${field.max}` : `Agregar ${field.itemLabel.toLowerCase()}`}
          </button>
        </fieldset>
      );
    }

    const value = String(getPath(data, absolutePath) ?? '');

    return (
      <FieldShell
        key={absolutePath}
        id={id}
        label={field.label}
        hint={field.hint}
        error={error}
        counter={field.kind !== 'url' ? <CharCounter value={value} max={field.max} /> : null}
      >
        {field.kind === 'textarea' ? (
          <textarea
            id={id}
            rows={field.rows ?? 3}
            value={value}
            onChange={(e) => update(absolutePath, e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className={inputClass(Boolean(error))}
          />
        ) : (
          <input
            id={id}
            type={field.kind === 'url' ? 'url' : 'text'}
            value={value}
            onChange={(e) => update(absolutePath, e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            className={inputClass(Boolean(error))}
          />
        )}
      </FieldShell>
    );
  }

  const saving = status.state === 'saving';

  return (
    <form onSubmit={handleSubmit} noValidate>
      {toast && (
        <div
          key={toast.id}
          /*
           * `status` + `polite` para el éxito: es información de progreso y no
           * debe interrumpir lo que el lector de pantalla esté leyendo.
           * `alert` + `assertive` para el error: exige atención inmediata.
           */
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          className={[
            'mb-6 flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm',
            toast.tone === 'success'
              ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200'
              : toast.tone === 'warn'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
                : 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300',
          ].join(' ')}
        >
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {toast.tone === 'success' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01" />
              </svg>
            )}
          </span>
          <p className="min-w-0 flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Cerrar aviso"
            className="-my-1 -mr-1 shrink-0 rounded p-1 transition-opacity hover:opacity-70"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {fields.map((field) => renderField(field))}
      </div>

      {/* Barra de guardado fija: en secciones largas el botón quedaría fuera de
          pantalla y el editor no sabría si hay cambios pendientes. */}
      <div className="sticky bottom-0 mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface/95 p-4 backdrop-blur">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm text-fg-muted">
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
              </svg>
              Guardando…
            </span>
          ) : isDirty ? (
            'Tienes cambios sin guardar.'
          ) : (
            'Todos los cambios están guardados.'
          )}
        </p>
        <a
          href="/admin"
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-muted"
        >
          Volver
        </a>
        <button
          type="submit"
          disabled={saving || !isDirty}
          aria-busy={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
