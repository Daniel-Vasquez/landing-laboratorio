import { useEffect, useMemo, useState } from 'react';
import { actions, isActionError } from 'astro:actions';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';

export type LayoutItem = {
  id_seccion: string;
  titulo_menu: string;
  orden: number;
  isVisible: boolean;
  movable: boolean;
  inMenu: boolean;
};

type Toast = { tone: 'success' | 'warn' | 'error'; message: string; id: number };
const TOAST_MS = 4500;

interface Props {
  initial: LayoutItem[];
}

export default function SectionLayoutEditor({ initial }: Props) {
  const [items, setItems] = useState<LayoutItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  /** Anuncio para lectores de pantalla tras mover con los botones. */
  const [announcement, setAnnouncement] = useState('');

  const isDirty = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(initial),
    [items, initial],
  );

  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  /**
   * Mueve un elemento respetando las secciones fijas.
   *
   * El hero y el CTA final no se mueven ni ceden su posición: sólo se
   * reordenan entre sí los elementos movibles.
   */
  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    if (!items[from]!.movable || !items[to]!.movable) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setItems(next);
    setAnnouncement(`${moved!.titulo_menu} movido a la posición ${to + 1} de ${items.length}.`);
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    move(result.source.index, result.destination.index);
  }

  function toggleVisible(index: number) {
    const item = items[index]!;
    if (!item.movable) return;
    setItems(items.map((it, i) => (i === index ? { ...it, isVisible: !it.isVisible } : it)));
  }

  function setTitle(index: number, titulo_menu: string) {
    setItems(items.map((it, i) => (i === index ? { ...it, titulo_menu } : it)));
  }

  async function save() {
    setSaving(true);
    setToast(null);
    try {
      const { data, error } = await actions.sections.updateLayout({
        items: items.map((item, index) => ({
          id_seccion: item.id_seccion,
          titulo_menu: item.titulo_menu,
          orden: index,
          isVisible: item.isVisible,
        })),
      });

      if (error) {
        if (isActionError(error) && error.code === 'UNAUTHORIZED') {
          window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setToast({ id: Date.now(), tone: 'error', message: error.message });
        return;
      }

      const triggered = data.deploy.ok && 'triggered' in data.deploy && data.deploy.triggered;
      setToast({
        id: Date.now(),
        tone: 'success',
        message: triggered
          ? 'Orden guardado. La landing se está actualizando.'
          : 'Orden guardado correctamente.',
      });
      setTimeout(() => window.location.reload(), TOAST_MS);
    } finally {
      setSaving(false);
    }
  }

  const hiddenCount = items.filter((item) => !item.isVisible).length;

  return (
    <div>
      {toast && (
        <p
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          className={[
            'mb-6 rounded-lg border px-4 py-3 text-sm',
            toast.tone === 'success'
              ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300',
          ].join(' ')}
        >
          {toast.message}
        </p>
      )}

      {/* Región viva para los movimientos hechos con los botones. La librería
          anuncia los arrastres por su cuenta. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="sections">
          {(provided) => (
            <ul
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="space-y-2 rounded-xl border border-border bg-surface p-3"
            >
              {items.map((item, index) => (
                <Draggable
                  key={item.id_seccion}
                  draggableId={item.id_seccion}
                  index={index}
                  isDragDisabled={!item.movable || saving}
                >
                  {(dragProvided, snapshot) => (
                    <li
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={[
                        'flex flex-wrap items-center gap-3 rounded-lg border p-3',
                        snapshot.isDragging ? 'border-primary bg-surface-muted' : 'border-border bg-bg',
                        !item.isVisible ? 'opacity-60' : '',
                      ].join(' ')}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        aria-hidden="true"
                        className={[
                          'shrink-0 text-fg-muted',
                          item.movable ? 'cursor-grab' : 'cursor-not-allowed opacity-30',
                        ].join(' ')}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4">
                          <path d="M4 8h16M4 16h16" />
                        </svg>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg">
                          {item.titulo_menu}
                          {!item.movable && (
                            <span className="ml-2 font-normal text-xs text-fg-muted">
                              · posición fija
                            </span>
                          )}
                        </span>
                        <span className="block font-mono text-xs text-fg-muted">
                          {item.id_seccion}
                        </span>
                      </span>

                      {item.inMenu && (
                        <label className="flex items-center gap-2 text-xs text-fg-muted">
                          <span className="sr-only sm:not-sr-only">Título en el menú</span>
                          <input
                            type="text"
                            value={item.titulo_menu}
                            maxLength={40}
                            aria-label={`Título en el menú de ${item.id_seccion}`}
                            onChange={(e) => setTitle(index, e.target.value)}
                            className="w-36 rounded-lg border border-border-strong bg-bg px-2.5 py-1.5 text-sm text-fg"
                          />
                        </label>
                      )}

                      <button
                        type="button"
                        onClick={() => toggleVisible(index)}
                        disabled={!item.movable || saving}
                        role="switch"
                        aria-checked={item.isVisible}
                        aria-label={`${item.isVisible ? 'Ocultar' : 'Mostrar'} ${item.titulo_menu}`}
                        className={[
                          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          item.isVisible ? 'bg-primary' : 'bg-border-strong',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'inline-block size-4 rounded-full bg-white transition-transform',
                            item.isVisible ? 'translate-x-6' : 'translate-x-1',
                          ].join(' ')}
                        />
                      </button>

                      {/*
                        Los botones ↑ ↓ NO son un extra: con teclado, con
                        motricidad reducida o en un táctil pequeño, arrastrar es
                        difícil o imposible. La lista tiene que ser utilizable
                        sin arrastrar nada. Mismo patrón que `RepeaterField`.
                      */}
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => move(index, index - 1)}
                          disabled={!item.movable || index === 0 || !items[index - 1]?.movable || saving}
                          aria-label={`Mover ${item.titulo_menu} hacia arriba`}
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                            <path d="m18 15-6-6-6 6" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, index + 1)}
                          disabled={!item.movable || index === items.length - 1 || !items[index + 1]?.movable || saving}
                          aria-label={`Mover ${item.titulo_menu} hacia abajo`}
                          className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </button>
                      </span>
                    </li>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>

      <div className="sticky bottom-0 mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface/95 p-4 backdrop-blur">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm text-fg-muted">
          {saving
            ? 'Guardando…'
            : isDirty
              ? 'Tienes cambios sin guardar.'
              : `${items.length} secciones · ${hiddenCount} oculta${hiddenCount === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !isDirty}
          aria-busy={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar orden'}
        </button>
      </div>
    </div>
  );
}
