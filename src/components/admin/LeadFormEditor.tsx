import { useEffect, useMemo, useState } from 'react';
import { actions, isActionError } from 'astro:actions';
import { QUESTIONS, type QuestionId } from '../../lib/leads/questions';
import type { LeadFormConfig, QuestionConfig } from '../../lib/leads/schemas';
import QuestionEditor from './QuestionEditor';
import { FieldShell, inputClass } from './fields';

type Toast = { tone: 'success' | 'error'; message: string; id: number };
const TOAST_MS = 4500;

/** E.164: `+` seguido de 8 a 15 dígitos, sin espacios. */
const E164 = /^\+[1-9]\d{7,14}$/;

interface Props {
  initial: LeadFormConfig;
}

export default function LeadFormEditor({ initial }: Props) {
  const [config, setConfig] = useState<LeadFormConfig>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(initial),
    [config, initial],
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

  function setContacto(field: 'whatsapp' | 'telefono' | 'correo', value: string) {
    setConfig((current) => ({ ...current, contacto: { ...current.contacto, [field]: value } }));
  }

  function setTexto(field: keyof LeadFormConfig['textos'], value: string) {
    setConfig((current) => ({ ...current, textos: { ...current.textos, [field]: value } }));
  }

  function setPregunta(id: QuestionId, next: QuestionConfig) {
    setConfig((current) => ({ ...current, preguntas: { ...current.preguntas, [id]: next } }));
  }

  async function save() {
    setSaving(true);
    setToast(null);
    try {
      const { data, error } = await actions.leadForm.updateConfig(config);
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
          ? 'Configuración guardada. La landing se está actualizando.'
          : 'Configuración guardada correctamente.',
      });
      setTimeout(() => window.location.reload(), TOAST_MS);
    } finally {
      setSaving(false);
    }
  }

  const phoneHint = 'Formato internacional sin espacios: +525512345678';
  const contactoIncompleto =
    !config.contacto.whatsapp || !config.contacto.telefono || !config.contacto.correo;

  return (
    <div className="space-y-6">
      {toast && (
        <p
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
          className={[
            'rounded-lg border px-4 py-3 text-sm',
            toast.tone === 'success'
              ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-900 dark:text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300',
          ].join(' ')}
        >
          {toast.message}
        </p>
      )}

      {contactoIncompleto && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <strong className="font-semibold">Faltan datos de contacto.</strong> El formulario no
          podrá enviar hasta que los tres estén completos. Se dejan vacíos a propósito: un número
          de ejemplo en producción enviaría pacientes a un desconocido.
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Destinos de contacto
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldShell
            id="wa"
            label="WhatsApp"
            hint={phoneHint}
            error={
              config.contacto.whatsapp && !E164.test(config.contacto.whatsapp)
                ? 'Formato inválido.'
                : undefined
            }
          >
            <input
              id="wa"
              type="tel"
              value={config.contacto.whatsapp}
              placeholder="+525512345678"
              onChange={(e) => setContacto('whatsapp', e.target.value.replace(/\s/g, ''))}
              className={inputClass(Boolean(config.contacto.whatsapp) && !E164.test(config.contacto.whatsapp))}
            />
          </FieldShell>

          <FieldShell
            id="tel"
            label="Teléfono para llamadas"
            hint={phoneHint}
            error={
              config.contacto.telefono && !E164.test(config.contacto.telefono)
                ? 'Formato inválido.'
                : undefined
            }
          >
            <input
              id="tel"
              type="tel"
              value={config.contacto.telefono}
              placeholder="+525512345678"
              onChange={(e) => setContacto('telefono', e.target.value.replace(/\s/g, ''))}
              className={inputClass(Boolean(config.contacto.telefono) && !E164.test(config.contacto.telefono))}
            />
          </FieldShell>

          <FieldShell id="mail" label="Correo de destino" hint="Donde llegarán los leads.">
            <input
              id="mail"
              type="email"
              value={config.contacto.correo}
              placeholder="laboratorio@hospitalcristal.mx"
              onChange={(e) => setContacto('correo', e.target.value.trim())}
              className={inputClass(false)}
            />
          </FieldShell>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Textos del formulario
        </h2>

        <FieldShell id="titulo" label="Título">
          <input
            id="titulo"
            type="text"
            value={config.textos.titulo}
            maxLength={80}
            onChange={(e) => setTexto('titulo', e.target.value)}
            className={inputClass(false)}
          />
        </FieldShell>

        <FieldShell id="intro" label="Texto introductorio">
          <input
            id="intro"
            type="text"
            value={config.textos.intro}
            maxLength={200}
            onChange={(e) => setTexto('intro', e.target.value)}
            className={inputClass(false)}
          />
        </FieldShell>

        <FieldShell id="exito" label="Mensaje de éxito">
          <input
            id="exito"
            type="text"
            value={config.textos.exito}
            maxLength={200}
            onChange={(e) => setTexto('exito', e.target.value)}
            className={inputClass(false)}
          />
        </FieldShell>

        <FieldShell
          id="consentimiento"
          label="Texto del consentimiento"
          hint="Debe remitir al aviso de privacidad. Lo exige la LFPDPPP para datos de salud."
        >
          <textarea
            id="consentimiento"
            rows={3}
            value={config.textos.consentimiento}
            maxLength={400}
            onChange={(e) => setTexto('consentimiento', e.target.value)}
            className={inputClass(false)}
          />
        </FieldShell>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">Preguntas</h2>
        <p className="text-sm text-fg-muted">
          Puedes reformular el texto y ajustar las opciones. El número de preguntas forma parte del
          diseño del formulario y no se edita desde aquí.
        </p>

        {QUESTIONS.map((definition) => (
          <QuestionEditor
            key={definition.id}
            definition={definition}
            value={config.preguntas[definition.id]!}
            onChange={(next) => setPregunta(definition.id, next)}
            disabled={saving}
          />
        ))}
      </section>

      <div className="sticky bottom-0 flex items-center gap-3 rounded-xl border border-border bg-surface/95 p-4 backdrop-blur">
        <p aria-live="polite" className="min-w-0 flex-1 text-sm text-fg-muted">
          {saving ? 'Guardando…' : isDirty ? 'Tienes cambios sin guardar.' : 'Todo guardado.'}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !isDirty}
          aria-busy={saving}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  );
}
