import { useEffect, useId, useRef, useState } from 'react';
import { actions, isActionError } from 'astro:actions';
import type { ImageSlot } from '../../lib/images/slots';

const ACCEPT = '.png,.jpg,.jpeg,.webp';
const MAX_MB = 5;
const TOAST_MS = 4500;

type Toast = { tone: 'success' | 'error'; message: string; id: number };

interface Props {
  slot: ImageSlot;
  /** URL de la imagen actual. `null` si la ranura está vacía. */
  currentUrl: string | null;
  currentAlt: string;
  /** La ranura es decorativa: no pide texto alternativo. */
  decorative: boolean;
}

export default function ImageSlotField({ slot, currentUrl, currentAlt, decorative }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState(currentAlt);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // La previsualización es un object URL: hay que revocarlo o se filtra memoria
  // cada vez que el usuario elige otro archivo.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(selected: File | null) {
    setToast(null);
    if (!selected) { setFile(null); return; }

    // Comprobaciones de comodidad: avisan antes de subir. La validación real
    // (por bytes) está en el servidor, que es lo único que no se puede saltar.
    const okExt = /\.(png|jpe?g|webp)$/i.test(selected.name);
    if (!okExt) {
      setToast({ id: Date.now(), tone: 'error', message: 'Solo se aceptan archivos PNG, JPG o WebP.' });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      setToast({
        id: Date.now(),
        tone: 'error',
        message: `La imagen pesa ${(selected.size / 1024 / 1024).toFixed(1)} MB. El máximo son ${MAX_MB} MB.`,
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(selected);
  }

  async function replace() {
    if (!file) return;
    setBusy(true);
    setToast(null);

    const form = new FormData();
    form.set('slotId', slot.id);
    form.set('alt', alt);
    form.set('file', file);

    try {
      const { data, error } = await actions.images.replace(form);

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
          ? 'Imagen reemplazada. La landing se está actualizando.'
          : 'Imagen reemplazada correctamente.',
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      // La imagen del servidor cambió: se refresca para ver la nueva.
      setTimeout(() => window.location.reload(), TOAST_MS);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <p className="text-sm font-semibold text-fg">{slot.label}</p>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row">
        <div
          className="w-full shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted sm:w-48"
          style={{ aspectRatio: slot.aspect.replace('/', ' / ') }}
        >
          {preview ?? currentUrl ? (
            <img
              src={preview ?? currentUrl!}
              alt={preview ? 'Vista previa de la imagen seleccionada' : currentAlt || ''}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-xs text-fg-muted">
              Sin imagen
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label htmlFor={`${id}-file`} className="mb-1.5 block text-sm font-medium text-fg">
              Reemplazar imagen
            </label>
            <input
              ref={inputRef}
              id={`${id}-file`}
              type="file"
              accept={ACCEPT}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-border-strong bg-bg text-sm text-fg file:mr-3 file:cursor-pointer file:border-0 file:bg-surface-muted file:px-3.5 file:py-2.5 file:text-sm file:font-medium file:text-fg"
            />
            <p className="mt-1.5 text-xs text-fg-muted">
              <strong className="font-semibold">Recomendación:</strong> Sube la imagen en formato
              WebP para mejorar la velocidad de carga de la web.
            </p>
          </div>

          {!decorative && (
            <div>
              <label htmlFor={`${id}-alt`} className="mb-1.5 block text-sm font-medium text-fg">
                Texto alternativo
              </label>
              <input
                id={`${id}-alt`}
                type="text"
                value={alt}
                maxLength={300}
                onChange={(e) => setAlt(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-bg px-3.5 py-2.5 text-sm text-fg"
              />
              <p className="mt-1.5 text-xs text-fg-muted">
                Describe qué se ve en la imagen. Lo leen los lectores de pantalla y lo usa Google.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={replace}
            disabled={!file || busy}
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && (
              <svg viewBox="0 0 24 24" className="size-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
              </svg>
            )}
            {busy ? 'Subiendo…' : 'Reemplazar imagen'}
          </button>
        </div>
      </div>

      {toast && (
        <p
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          className={[
            'mt-3 rounded-lg border px-3.5 py-2.5 text-sm',
            toast.tone === 'success'
              ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300',
          ].join(' ')}
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
