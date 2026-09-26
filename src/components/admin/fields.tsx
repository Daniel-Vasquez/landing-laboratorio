import type { ReactNode } from 'react';

export function FieldShell({
  id,
  label,
  hint,
  error,
  counter,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  counter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {/* <label for> real: un placeholder no es una etiqueta accesible. */}
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {counter}
      </div>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function CharCounter({ value, max }: { value: string; max?: number }) {
  if (!max) return null;
  const length = [...value].length;
  const over = length > max;
  const near = !over && length > max * 0.9;
  return (
    <span
      className={[
        'shrink-0 font-mono text-xs tabular-nums',
        over ? 'font-semibold text-red-600 dark:text-red-400' : near ? 'text-amber-600 dark:text-amber-400' : 'text-fg-muted',
      ].join(' ')}
    >
      {length}/{max}
    </span>
  );
}

export const inputClass = (hasError: boolean) =>
  [
    'w-full rounded-lg border bg-bg px-3.5 py-2.5 text-sm text-fg',
    'placeholder:text-fg-muted/70',
    // border-strong, no border: WCAG 1.4.11 pide 3:1 para el límite de un
    // control, y el borde decorativo de tarjeta solo da 1.16:1.
    hasError ? 'border-red-500' : 'border-border-strong',
  ].join(' ');
