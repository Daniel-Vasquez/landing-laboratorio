import { useEffect, useMemo, useRef, useState } from 'react';
import { REACT_ICONS } from '../../lib/icons/react-catalog';
import { ICON_META, FALLBACK_ICON, searchIcons, type IconName } from '../../lib/icons/names';
import { contrastRatio, isValidHex } from '../../lib/color/contrast';
import ColorField from './ColorField';

export type IconValue = { name: IconName; color: string; background: string | null };

interface Props {
  value: IconValue | undefined;
  onChange: (value: IconValue) => void;
  label: string;
  /** Color de la tarjeta sobre la que se dibuja, para medir el contraste real. */
  surfaceColor?: string;
  disabled?: boolean;
}

const DEFAULT_COLOR = '#0f766e';
const DEFAULT_BACKGROUND = '#e7f4f3';

export default function IconPicker({
  value,
  onChange,
  label,
  surfaceColor = '#ffffff',
  disabled = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');

  const current: IconValue = value ?? {
    name: FALLBACK_ICON,
    color: DEFAULT_COLOR,
    background: DEFAULT_BACKGROUND,
  };

  const results = useMemo(() => searchIcons(query), [query]);

  /**
   * `<dialog>` + `showModal()` en lugar de un popover a mano.
   *
   * El elemento nativo aporta focus trap, cierre con Escape, fondo inerte y
   * devolución del foco al disparador. Es el mismo patrón que `MobileNav.astro`
   * ya usa en la landing: reimplementarlo en React sería reintroducir errores
   * que el navegador ya resuelve.
   */
  function open() {
    setQuery('');
    dialogRef.current?.showModal();
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => triggerRef.current?.focus();
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, []);

  const Preview = REACT_ICONS[current.name] ?? REACT_ICONS[FALLBACK_ICON];

  /**
   * Contraste del icono contra lo que tiene detrás: su pastilla si la hay, o la
   * tarjeta si no. Se MUESTRA pero no bloquea: estos iconos son decorativos
   * (`aria-hidden`) y van junto a un título de texto, así que WCAG 1.4.11 no los
   * exige. Un icono ilegible sigue siendo mal diseño, de ahí el aviso.
   */
  const behind = current.background ?? surfaceColor;
  const ratio =
    isValidHex(current.color) && isValidHex(behind) ? contrastRatio(current.color, behind) : null;
  const lowContrast = ratio !== null && ratio < 3;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-fg">{label}</p>

      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        disabled={disabled}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-3 rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        <span
          className="grid size-9 shrink-0 place-items-center rounded-lg"
          style={{ backgroundColor: current.background ?? 'transparent' }}
        >
          <Preview size={20} color={current.color} aria-hidden />
        </span>
        <span>
          <span className="block font-medium">{ICON_META[current.name].label}</span>
          <span className="block text-xs text-fg-muted">Cambiar icono y colores</span>
        </span>
      </button>

      {lowContrast && (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
          Contraste {ratio.toFixed(2)}:1 — por debajo de 3:1 el icono se ve muy tenue.
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-label={`Seleccionar ${label.toLowerCase()}`}
        className="w-[min(34rem,92vw)] rounded-2xl border border-border bg-surface p-0 text-fg backdrop:bg-black/50"
      >
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <h2 className="text-base font-semibold">Seleccionar icono</h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Cerrar"
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-4">
            <div>
              <label htmlFor="icon-search" className="mb-1.5 block text-sm font-medium text-fg">
                Buscar
              </label>
              <input
                id="icon-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="rapidez, sangre, corazón, precio…"
                className="w-full rounded-lg border border-border-strong bg-bg px-3.5 py-2.5 text-sm text-fg"
              />
              <p aria-live="polite" className="mt-1.5 text-xs text-fg-muted">
                {results.length === 0
                  ? 'Ningún icono coincide.'
                  : `${results.length} icono${results.length === 1 ? '' : 's'}`}
              </p>
            </div>

            <ul className="grid grid-cols-5 gap-2 sm:grid-cols-8">
              {results.map((name) => {
                const Item = REACT_ICONS[name];
                const selected = name === current.name;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => onChange({ ...current, name })}
                      aria-pressed={selected}
                      title={ICON_META[name].label}
                      className={[
                        'grid aspect-square w-full place-items-center rounded-lg border transition-colors',
                        selected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-fg-muted hover:bg-surface-muted hover:text-fg',
                      ].join(' ')}
                    >
                      <Item size={20} aria-hidden />
                      <span className="sr-only">{ICON_META[name].label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <ColorField
                label="Color del icono"
                value={current.color}
                onChange={(color) => onChange({ ...current, color })}
              />
              <ColorField
                label="Color de fondo"
                value={current.background ?? DEFAULT_BACKGROUND}
                onChange={(background) => onChange({ ...current, background })}
                onClear={() => onChange({ ...current, background: null })}
                disabled={current.background === null}
                hint={current.background === null ? undefined : 'Pastilla detrás del icono.'}
              />
            </div>

            {current.background === null && (
              <p className="text-xs text-fg-muted">
                Sin fondo: el icono se dibuja suelto.{' '}
                <button
                  type="button"
                  onClick={() => onChange({ ...current, background: DEFAULT_BACKGROUND })}
                  className="font-medium text-accent underline-offset-4 hover:underline"
                >
                  Añadir fondo
                </button>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border p-4">
            <p className="text-xs text-fg-muted">
              {ratio !== null && `Contraste ${ratio.toFixed(2)}:1`}
              {lowContrast && ' · se verá muy tenue'}
            </p>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Listo
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
