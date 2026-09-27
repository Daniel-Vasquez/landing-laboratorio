import { useId } from 'react';
import type { QuestionDefinition } from '../../lib/leads/questions';
import { newOptionValue } from '../../lib/leads/questions';
import type { QuestionConfig } from '../../lib/leads/schemas';

interface Props {
  definition: QuestionDefinition;
  value: QuestionConfig;
  onChange: (next: QuestionConfig) => void;
  disabled?: boolean;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 8;

/**
 * Editor de UNA pregunta.
 *
 * No hay —ni puede haber— botón de añadir o eliminar preguntas: el conjunto
 * vive en `leads/questions.ts`. Aquí solo se reformula el enunciado y, cuando
 * la pregunta lo permite, se editan sus opciones.
 */
export default function QuestionEditor({ definition, value, onChange, disabled = false }: Props) {
  const id = useId();
  const editable = definition.optionsEditable;
  const atMin = value.options.length <= MIN_OPTIONS;
  const atMax = value.options.length >= MAX_OPTIONS;

  function setOption(index: number, label: string) {
    onChange({
      ...value,
      options: value.options.map((option, i) => (i === index ? { ...option, label } : option)),
    });
  }

  function addOption() {
    if (atMax) return;
    // El `value` lo genera el cliente pero el servidor lo conserva solo si es
    // nuevo: nunca puede apropiarse del código de otra opción.
    onChange({
      ...value,
      options: [...value.options, { value: newOptionValue(), label: '' }],
    });
  }

  function removeOption(index: number) {
    if (atMin) return;
    onChange({ ...value, options: value.options.filter((_, i) => i !== index) });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.options.length) return;
    const options = [...value.options];
    const [moved] = options.splice(from, 1);
    options.splice(to, 0, moved!);
    onChange({ ...value, options });
  }

  return (
    <fieldset className="rounded-xl border border-border bg-bg p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {definition.step === 0 ? 'Visible en todos los pasos' : `Paso ${definition.step}`}
      </legend>

      <label htmlFor={`${id}-label`} className="mb-1.5 block text-sm font-medium text-fg">
        Pregunta
      </label>
      <input
        id={`${id}-label`}
        type="text"
        value={value.label}
        maxLength={160}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, label: e.target.value })}
        className="w-full rounded-lg border border-border-strong bg-bg px-3.5 py-2.5 text-sm text-fg disabled:opacity-60"
      />

      <p className="mt-4 text-sm font-medium text-fg">
        Opciones{' '}
        <span className="font-normal text-fg-muted">
          ({value.options.length}
          {editable ? `/${MAX_OPTIONS}` : ''})
        </span>
      </p>

      {!editable && (
        <p className="mt-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-900 dark:text-sky-200">
          Estas opciones no se pueden editar: cada una activa una forma de contacto distinta
          (WhatsApp, llamada o correo). Añadir una sin su lógica dejaría un envío que no llega a
          ninguna parte.
        </p>
      )}

      <ul className="mt-2.5 space-y-2">
        {value.options.map((option, index) => (
          <li key={option.value} className="flex items-start gap-2">
            <span className="mt-2.5 w-4 shrink-0 text-right font-mono text-xs text-fg-muted">
              {index + 1}
            </span>
            <input
              type="text"
              value={option.label}
              maxLength={160}
              disabled={disabled || !editable}
              aria-label={`Opción ${index + 1} de ${definition.defaultLabel}`}
              onChange={(e) => setOption(index, e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-bg px-3.5 py-2.5 text-sm text-fg disabled:opacity-60"
            />
            {editable && (
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={disabled || index === 0}
                  aria-label={`Subir la opción ${index + 1}`}
                  className="mt-1 inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={disabled || index === value.options.length - 1}
                  aria-label={`Bajar la opción ${index + 1}`}
                  className="mt-1 inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  disabled={disabled || atMin}
                  aria-label={`Eliminar la opción ${index + 1}`}
                  className="mt-1 inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <button
          type="button"
          onClick={addOption}
          disabled={disabled || atMax}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {atMax ? `Máximo ${MAX_OPTIONS} opciones` : 'Agregar opción'}
        </button>
      )}
    </fieldset>
  );
}
