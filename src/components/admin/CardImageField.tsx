import { useEffect, useId, useState } from 'react';

const ACCEPT = '.png,.jpg,.jpeg,.webp';
const MAX_MB = 5;

interface Props {
  /** Título de la tarjeta, solo para etiquetas accesibles. */
  cardTitle: string;
  /** URL de la imagen ya guardada, o null si la tarjeta aún no tiene. */
  currentUrl: string | null;
  /** Archivo seleccionado pendiente de subir, si lo hay. */
  file: File | null;
  alt: string;
  aspect: string;
  onFileChange: (file: File | null) => void;
  onAltChange: (alt: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/**
 * Campo de imagen EMBEBIDO en la tarjeta del estudio.
 *
 * A diferencia de `ImageSlotField` (que sube al instante y sirve para ranuras
 * fijas ya existentes), este componente NO sube nada: solo selecciona el
 * archivo y lo reporta hacia arriba. La subida la orquesta `SectionEditor` al
 * guardar, para que una tarjeta nueva pueda crearse con su texto y su imagen en
 * un único paso.
 */
export default function CardImageField({
  cardTitle,
  currentUrl,
  file,
  alt,
  aspect,
  onFileChange,
  onAltChange,
  onError,
  disabled = false,
}: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    // Revocar o se filtra memoria por cada archivo que el usuario elija.
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(selected: File | null) {
    if (!selected) {
      onFileChange(null);
      return;
    }
    // Comprobaciones de comodidad. La validación real (por bytes) es del
    // servidor, que es lo único que no se puede saltar.
    if (!/\.(png|jpe?g|webp)$/i.test(selected.name)) {
      onError(`«${cardTitle}»: solo se aceptan archivos PNG, JPG o WebP.`);
      onFileChange(null);
      return;
    }
    if (selected.size > MAX_MB * 1024 * 1024) {
      onError(
        `«${cardTitle}»: la imagen pesa ${(selected.size / 1024 / 1024).toFixed(1)} MB. El máximo son ${MAX_MB} MB.`,
      );
      onFileChange(null);
      return;
    }
    onFileChange(selected);
  }

  const shown = preview ?? currentUrl;

  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm font-medium text-fg">Imagen de la tarjeta</p>

      <div className="mt-2.5 flex flex-col gap-3 sm:flex-row">
        <div
          className="w-full shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted sm:w-40"
          style={{ aspectRatio: aspect.replace('/', ' / ') }}
        >
          {shown ? (
            <img
              src={shown}
              alt={preview ? `Vista previa de la nueva imagen de ${cardTitle}` : alt || ''}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center px-2 text-center text-xs text-fg-muted">
              Sin imagen
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <label htmlFor={`${id}-file`} className="sr-only">
              {currentUrl ? 'Reemplazar imagen de' : 'Subir imagen de'} {cardTitle}
            </label>
            <input
              id={`${id}-file`}
              type="file"
              accept={ACCEPT}
              disabled={disabled}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-border-strong bg-bg text-sm text-fg file:mr-3 file:cursor-pointer file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg disabled:opacity-60"
            />
            <p className="mt-1.5 text-xs text-fg-muted">
              <strong className="font-semibold">Recomendación:</strong> Sube la imagen en formato
              WebP para mejorar la velocidad de carga de la web.
            </p>
            {file && (
              <p className="mt-1.5 text-xs font-medium text-accent">
                Se subirá al guardar: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-alt`} className="mb-1.5 block text-sm font-medium text-fg">
              Texto alternativo
            </label>
            <input
              id={`${id}-alt`}
              type="text"
              value={alt}
              maxLength={300}
              disabled={disabled}
              onChange={(e) => onAltChange(e.target.value)}
              className="w-full rounded-lg border border-border-strong bg-bg px-3.5 py-2.5 text-sm text-fg disabled:opacity-60"
            />
            <p className="mt-1.5 text-xs text-fg-muted">
              Describe qué se ve en la imagen. Lo leen los lectores de pantalla y lo usa Google.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
