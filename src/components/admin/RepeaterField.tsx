import type { Field } from './fieldMap';
import { emptyItem } from './fieldMap';

interface Props {
  field: Extract<Field, { kind: 'repeater' }>;
  items: unknown[];
  onChange: (items: unknown[]) => void;
  renderItemField: (field: Field, absolutePath: string) => React.ReactNode;
  /**
   * Claves de imagen que YA tienen una imagen subida. Sirve para advertir antes
   * de eliminar una tarjeta cuya imagen se perdería.
   */
  imageKeysWithImage?: ReadonlySet<string>;
  /**
   * Render del campo de imagen DENTRO de cada tarjeta. Se recibe como render
   * prop para que el repeater no sepa nada de Cloudinary ni del estado de
   * archivos: solo decide dónde va.
   */
  renderCardImage?: (item: unknown, index: number) => React.ReactNode;
  /** Permite decorar el item nuevo (p. ej. asignarle un `imageKey`). */
  makeItem?: () => Record<string, unknown>;
}

export default function RepeaterField({
  field,
  items,
  onChange,
  renderItemField,
  imageKeysWithImage,
  renderCardImage,
  makeItem,
}: Props) {
  const atMax = items.length >= field.max;

  /**
   * ¿Este item tiene una imagen asociada que se perdería al borrarlo?
   *
   * Renombrar una tarjeta NO pierde la imagen: el emparejamiento es por
   * `imageKey`, un id inmutable. Eliminarla sí, y de forma irreversible, así
   * que ese es el único punto donde tiene sentido advertir.
   */
  function hasImage(item: unknown): boolean {
    const key = (item as { imageKey?: unknown })?.imageKey;
    return typeof key === 'string' && Boolean(imageKeysWithImage?.has(key));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function remove(index: number) {
    const item = items[index];
    if (hasImage(item)) {
      const name = itemTitle(item, index);
      const confirmed = window.confirm(
        `«${name}» tiene una imagen.\n\n` +
          'Si eliminas esta tarjeta, su imagen dejará de mostrarse en la web y tendrás ' +
          'que volver a subirla si la recuperas más adelante.\n\n' +
          '¿Eliminar la tarjeta de todos modos?',
      );
      if (!confirmed) return;
    }
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    if (atMax) return;
    // `makeItem` inyecta el `imageKey` en los grupos con imagen, para que la
    // tarjeta nueva muestre su campo de imagen desde el primer momento.
    onChange([...items, makeItem ? makeItem() : emptyItem(field.fields)]);
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
                {hasImage(item) && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-fg-muted"
                    title="Esta tarjeta tiene una imagen asociada"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-4.35-4.35a2 2 0 0 0-2.83 0L4 21" />
                    </svg>
                    con imagen
                  </span>
                )}
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
              {/* Texto e imagen en la MISMA tarjeta: el editor no tiene que
                  guardar primero y subir la foto después. */}
              {renderCardImage?.(item, index)}
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
