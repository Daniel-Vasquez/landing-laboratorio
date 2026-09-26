/**
 * Formateo de fechas SIEMPRE en el servidor.
 *
 * Si se formateara en el cliente, el HTML del servidor y el primer render de
 * React diferirían (distinta zona horaria / locale) y React lanzaría un
 * hydration mismatch. Además la zona se fija a America/Mexico_City en lugar de
 * usar la del servidor: en Vercel las funciones corren en UTC, así que un
 * cambio guardado a las 23:30 de CDMX se mostraría con la fecha del día
 * siguiente.
 */
const TIME_ZONE = 'America/Mexico_City';
const LOCALE = 'es-MX';

export function formatDateTime(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: TIME_ZONE,
  }).format(date);
}

/** "hace 2 horas", "hace 3 días". Complementa a la fecha absoluta, no la sustituye. */
export function formatRelative(date: Date | null, now = new Date()): string {
  if (!date) return 'Sin cambios';

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, secondsPerUnit] of units) {
    if (Math.abs(seconds) >= secondsPerUnit) {
      return rtf.format(Math.round(seconds / secondsPerUnit), unit);
    }
  }
  return rtf.format(Math.round(seconds), 'second');
}
