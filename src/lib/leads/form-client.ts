import { SUBMIT_LABELS, type ContactMedium } from './questions.ts';

/**
 * Comportamiento del formulario, en vanilla y cargado BAJO DEMANDA.
 *
 * No es React a propósito: un island habría añadido ~66 KB a una landing que
 * hoy sirve 2 KB de JavaScript. Este módulo solo se descarga cuando alguien
 * pulsa un CTA, así que quien lee la página y se va no paga nada.
 */

const TOTAL_PASOS = 3;

let iniciado = false;
let abiertoEn = 0;
let pasoActual = 1;

function q<T extends Element>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}

export function openLeadForm(origen: string): void {
  const dialog = q<HTMLDialogElement>('#lead-form');
  const form = q<HTMLFormElement>('#lead-form-el');
  if (!dialog || !form) return;

  if (!iniciado) {
    conectar(dialog, form);
    iniciado = true;
  }

  form.dataset.origen = origen;
  abiertoEn = Date.now();
  irAPaso(form, 1);
  dialog.showModal();
}

function conectar(dialog: HTMLDialogElement, form: HTMLFormElement) {
  /**
   * Bloqueo del scroll de fondo.
   *
   * `showModal()` vuelve inerte el documento pero no impide de forma
   * consistente entre navegadores que la rueda desplace la página detrás.
   */
  let overflowPrevio = '';
  dialog.addEventListener('close', () => {
    document.body.style.overflow = overflowPrevio;
  });
  const abrirOriginal = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
    overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    abrirOriginal();
  };

  q('[data-lead-close]', form)?.addEventListener('click', () => dialog.close());
  q('[data-lead-prev]', form)?.addEventListener('click', () => irAPaso(form, pasoActual - 1));
  q('[data-lead-next]', form)?.addEventListener('click', () => {
    if (!validarPaso(form, pasoActual)) return;
    irAPaso(form, pasoActual + 1);
  });

  // El medio elegido cambia el campo de contacto y el texto del botón.
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[name="medio"]')) {
    radio.addEventListener('change', () => sincronizarMedio(form));
  }
  sincronizarMedio(form);

  form.addEventListener('submit', (event) => enviar(event, form));
}

function medioActual(form: HTMLFormElement): ContactMedium {
  const checked = form.querySelector<HTMLInputElement>('input[name="medio"]:checked');
  return (checked?.value as ContactMedium) ?? 'whatsapp';
}

/**
 * Muestra el campo que corresponde al medio SIN borrar el otro.
 *
 * Los dos inputs permanecen en el DOM con su valor: cambiar de preferencia en
 * el paso 3 no debe hacer perder lo ya escrito.
 */
function sincronizarMedio(form: HTMLFormElement) {
  const medio = medioActual(form);
  const usaCorreo = medio === 'correo';

  q<HTMLElement>('[data-lead-field="telefono"]', form)?.toggleAttribute('hidden', usaCorreo);
  q<HTMLElement>('[data-lead-field="correo"]', form)?.toggleAttribute('hidden', !usaCorreo);

  const submit = q<HTMLButtonElement>('[data-lead-submit]', form);
  if (submit) submit.textContent = SUBMIT_LABELS[medio];
}

function irAPaso(form: HTMLFormElement, paso: number) {
  pasoActual = Math.min(Math.max(paso, 1), TOTAL_PASOS);

  for (const seccion of form.querySelectorAll<HTMLElement>('[data-lead-step]')) {
    seccion.toggleAttribute('hidden', Number(seccion.dataset.leadStep) !== pasoActual);
  }

  const progreso = q<HTMLElement>('[data-lead-progress]', form);
  if (progreso) progreso.textContent = `Paso ${pasoActual} de ${TOTAL_PASOS}`;

  q<HTMLElement>('[data-lead-prev]', form)?.toggleAttribute('hidden', pasoActual === 1);
  q<HTMLElement>('[data-lead-next]', form)?.toggleAttribute('hidden', pasoActual === TOTAL_PASOS);
  q<HTMLElement>('[data-lead-submit]', form)?.toggleAttribute('hidden', pasoActual !== TOTAL_PASOS);

  ocultarError(form);

  /*
   * Mover el foco al encabezado del paso nuevo.
   *
   * Sin esto el foco se queda en «Siguiente», que acaba de desaparecer del
   * paso visible, y quien navega con teclado o lector de pantalla se queda sin
   * referencia de dónde está.
   */
  const activo = form.querySelector<HTMLElement>(
    `[data-lead-step="${pasoActual}"] [data-lead-step-title]`,
  );
  activo?.focus();
}

function validarPaso(form: HTMLFormElement, paso: number): boolean {
  const seccion = form.querySelector<HTMLElement>(`[data-lead-step="${paso}"]`);
  if (!seccion) return true;

  for (const grupo of seccion.querySelectorAll<HTMLElement>('fieldset')) {
    const radios = grupo.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    if (radios.length === 0) continue;
    if (![...radios].some((radio) => radio.checked)) {
      const leyenda = grupo.querySelector('legend')?.textContent ?? 'esta pregunta';
      mostrarError(form, `Elige una opción en «${leyenda.trim()}».`);
      radios[0]?.focus();
      return false;
    }
  }
  return true;
}

function mostrarError(form: HTMLFormElement, mensaje: string) {
  const caja = q<HTMLElement>('[data-lead-error]', form);
  if (!caja) return;
  caja.textContent = mensaje;
  caja.hidden = false;
}

function ocultarError(form: HTMLFormElement) {
  const caja = q<HTMLElement>('[data-lead-error]', form);
  if (caja) caja.hidden = true;
}

async function enviar(event: SubmitEvent, form: HTMLFormElement) {
  event.preventDefault();
  if (!validarPaso(form, 3)) return;

  const datos = new FormData(form);
  const medio = medioActual(form);
  const submit = q<HTMLButtonElement>('[data-lead-submit]', form);

  /**
   * La ventana de WhatsApp se abre AQUÍ, de forma síncrona.
   *
   * `window.open()` después de un `await` pierde el contexto de gesto de
   * usuario y el bloqueador lo corta: el lead quedaría guardado pero la
   * pestaña no abriría, y el visitante creería que falló.
   */
  const ventana = medio === 'whatsapp' ? window.open('about:blank', '_blank') : null;

  if (submit) {
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
  }
  ocultarError(form);

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        medio,
        nombre: String(datos.get('nombre') ?? '').trim(),
        telefono: String(datos.get('telefono') ?? ''),
        correo: String(datos.get('correo') ?? ''),
        motivo: String(datos.get('motivo') ?? ''),
        estudio: String(datos.get('estudio') ?? ''),
        plazo: String(datos.get('plazo') ?? ''),
        origen: form.dataset.origen ?? '',
        consentimiento: datos.get('consentimiento') === 'on',
        empresa: String(datos.get('empresa') ?? ''),
        ms: Date.now() - abiertoEn,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      fields?: Array<{ path: string; message: string }>;
      waUrl?: string;
      telUrl?: string;
      telefono?: string;
    };

    if (!data.ok) {
      ventana?.close();
      mostrarError(form, data.fields?.[0]?.message ?? data.error ?? 'No pudimos enviar tu solicitud.');
      return;
    }

    if (medio === 'whatsapp' && data.waUrl) {
      if (ventana) ventana.location.href = data.waUrl;
      // El bloqueador ganó: sin este enlace el visitante se quedaría sin salida.
      else mostrarExito(form, 'Abre WhatsApp para enviar tu mensaje:', data.waUrl, 'Abrir WhatsApp');
      if (ventana) mostrarExito(form);
    } else if (medio === 'llamada' && data.telUrl) {
      window.location.href = data.telUrl;
      // En escritorio `tel:` puede no hacer nada: el número debe verse.
      mostrarExito(form, `Llámanos al ${data.telefono}`, data.telUrl, 'Marcar ahora');
    } else {
      mostrarExito(form);
    }

    limpiar(form);
  } catch {
    ventana?.close();
    mostrarError(form, 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.');
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  }
}

function mostrarExito(form: HTMLFormElement, extra?: string, href?: string, textoEnlace?: string) {
  const caja = q<HTMLElement>('[data-lead-success]', form);
  const extraEl = q<HTMLElement>('[data-lead-success-extra]', form);
  if (!caja) return;

  if (extra && extraEl) {
    extraEl.textContent = '';
    extraEl.append(extra + ' ');
    if (href && textoEnlace) {
      const enlace = document.createElement('a');
      enlace.href = href;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.className = 'font-semibold underline underline-offset-4';
      enlace.textContent = textoEnlace;
      extraEl.append(enlace);
    }
    extraEl.hidden = false;
  }

  caja.hidden = false;
  caja.scrollIntoView({ block: 'nearest' });
}

/** Limpia los campos tras un envío correcto, como pide el requerimiento. */
function limpiar(form: HTMLFormElement) {
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="tel"], input[type="email"]')) {
    input.value = '';
  }
  for (const radio of form.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    if (radio.name !== 'medio') radio.checked = false;
  }
  const consent = form.querySelector<HTMLInputElement>('input[name="consentimiento"]');
  if (consent) consent.checked = false;
}
