import { useEffect, useId, useMemo, useState, type SubmitEvent } from 'react';
import { actions, isActionError, isInputError } from 'astro:actions';
import type { SectionKey } from '../../lib/content/schemas';
import { FIELD_MAP, type Field } from './fieldMap';
import { deepClone, getPath, setPath } from './paths';
import RepeaterField from './RepeaterField';
import { CharCounter, FieldShell, inputClass } from './fields';

type Status =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'error'; message: string };

interface Props {
  sectionKey: SectionKey;
  initialData: unknown;
}

export default function SectionEditor({ sectionKey, initialData }: Props) {
  // Copia profunda: el objeto que llega del servidor no debe mutarse, para
  // poder comparar contra él y saber si hay cambios sin guardar.
  const pristine = useMemo(() => deepClone(initialData), [initialData]);
  const [data, setData] = useState<unknown>(() => deepClone(initialData));
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const baseId = useId();

  const fields = FIELD_MAP[sectionKey];
  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(pristine),
    [data, pristine],
  );

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
    // Un cambio invalida el "guardado" anterior: el estado ya no lo refleja.
    setStatus((current) => (current.state === 'saved' ? { state: 'idle' } : current));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ state: 'saving' });
    setFieldErrors({});

    const { data: result, error } = await actions.content.updateSection({
      key: sectionKey,
      data,
    });

    if (error) {
      // isInputError -> falló el esquema del INPUT de la action (key/data).
      if (isInputError(error)) {
        setStatus({
          state: 'error',
          message: 'Los datos enviados no tienen el formato esperado.',
        });
        return;
      }

      if (isActionError(error) && error.code === 'UNAUTHORIZED') {
        // La sesión murió: recargar lleva al login preservando el destino.
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      setStatus({ state: 'error', message: error.message });
      return;
    }

    setStatus({ state: 'saved', at: result.savedAt });
    // Recargar para que el pristine y la metadata del servidor se actualicen.
    window.location.reload();
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
      {status.state === 'error' && (
        <p
          role="alert"
          className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {status.message}
        </p>
      )}

      <div className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
        {fields.map((field) => renderField(field))}
      </div>

      {/* Barra de guardado fija: en secciones largas el botón quedaría fuera de
          pantalla y el editor no sabría si hay cambios pendientes. */}
      <div className="sticky bottom-0 mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface/95 p-4 backdrop-blur">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm text-fg-muted">
          {saving
            ? 'Guardando…'
            : isDirty
              ? 'Tienes cambios sin guardar.'
              : 'Todos los cambios están guardados.'}
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
