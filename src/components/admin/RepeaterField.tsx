import type { Field } from './fieldMap';
import { emptyItem } from './fieldMap';

interface Props {
  field: Extract<Field, { kind: 'repeater' }>;
  items: unknown[];
  onChange: (items: unknown[]) => void;
  renderItemField: (field: Field, absolutePath: string) => React.ReactNode;
}

export default function RepeaterField({ field, items, onChange, renderItemField }: Props) {
  const atMax = items.length >= field.max;

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    if (atMax) return;
    onChange([...items, emptyItem(field.fields)]);
  }

  function itemTitle(item: unknown, index: number): string {
    const value = (item as Record<string, unknown>)?.[field.titleField];
    const text = typeof value === 'string' ? value.trim() : '';
    return text.length > 0 ? text : `${field.itemLabel} ${index + 1}`;
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg">
        {field.label}{' '}
        <span className="font-normal text-fg-muted">
          ({items.length}/{field.max})
        </span>
      </legend>
      {field.hint && <p className="mt-1 text-xs text-fg-muted">{field.hint}</p>}

      <ol className="mt-3 space-y-3">
        {items.map((item, index) => (
          <li key={index} className="rounded-xl border border-border bg-bg p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
                <span className="mr-2 font-mono text-xs text-fg-muted">{index + 1}</span>
                {itemTitle(item, index)}
              </span>

              {/* aria-label explícito: "↑" no dice nada a un lector de pantalla. */}
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={`Mover ${itemTitle(item, index)} hacia arriba`}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === items.length - 1}
                aria-label={`Mover ${itemTitle(item, index)} hacia abajo`}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Eliminar ${itemTitle(item, index)}`}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {field.fields.map((sub) =>
                renderItemField(sub, `${field.path}.${index}.${sub.path}`),
              )}
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={add}
        disabled={atMax}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {atMax ? `Máximo ${field.max} alcanzado` : `Agregar ${field.itemLabel.toLowerCase()}`}
      </button>
    </fieldset>
  );
}
