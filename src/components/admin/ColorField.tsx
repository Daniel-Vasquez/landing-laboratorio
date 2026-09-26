import { useId } from 'react';
import { isValidHex, normalizeHex } from '../../lib/color/contrast';

interface Props {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Permite desactivar el color (guarda `null`). Para el fondo. */
  onClear?: () => void;
  disabled?: boolean;
  hint?: string;
}

/**
 * Selector de color nativo + campo hexadecimal, sincronizados.
 *
 * Los dos controles existen porque resuelven necesidades distintas: la rueda
 * nativa sirve para explorar, y el campo de texto para pegar un color exacto de
 * la guía de marca. Escribir solo uno de los dos deja siempre a alguien fuera.
 */
export default function ColorField({
  label,
  value,
  onChange,
  onClear,
  disabled = false,
  hint,
}: Props) {
  const id = useId();
  const valid = isValidHex(value);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={`${id}-hex`} className="text-sm font-medium text-fg">
          {label}
        </label>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-xs font-medium text-accent underline-offset-4 hover:underline"
          >
            Sin fondo
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label}: selector visual`}
          value={valid ? value : '#000000'}
          disabled={disabled}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          className="size-10 shrink-0 cursor-pointer rounded-lg border border-border-strong bg-bg disabled:opacity-60"
        />
        <input
          id={`${id}-hex`}
          type="text"
          inputMode="text"
          spellCheck={false}
          value={value}
          maxLength={7}
          disabled={disabled}
          onChange={(e) => onChange(normalizeHex(e.target.value))}
          aria-invalid={!valid}
          className={[
            'w-full rounded-lg border bg-bg px-3 py-2.5 font-mono text-sm text-fg disabled:opacity-60',
            valid ? 'border-border-strong' : 'border-red-500',
          ].join(' ')}
        />
      </div>

      {!valid && (
        <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          Escribe un color como #0f766e (6 dígitos).
        </p>
      )}
      {hint && valid && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}
