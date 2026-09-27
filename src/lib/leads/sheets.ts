import { optionalEnv } from '../env.ts';

export type SheetRow = {
  nombre: string;
  correo: string;
  telefono: string;
  servicio: string;
  medio: string;
  fecha: string;
};

/**
 * Registra el lead en Google Sheets a través del Apps Script.
 *
 * NUNCA lanza. Sheets es un registro SECUNDARIO: la fuente de verdad es la
 * colección `leads` en MongoDB. Perder un paciente porque una hoja de cálculo
 * no respondió sería absurdo, así que el error se devuelve para anotarlo y el
 * envío continúa.
 */
export async function logLeadToSheets(row: SheetRow): Promise<{ ok: boolean; error: string | null }> {
  const url = optionalEnv('SHEETS_WEBHOOK_URL');
  const token = optionalEnv('SHEETS_WEBHOOK_TOKEN');

  // Sin configurar no es un error: permite desarrollar sin escribir en la hoja
  // real, igual que `VERCEL_DEPLOY_HOOK_URL` vacío en la Tanda 7.
  if (!url || !token) return { ok: false, error: 'disabled' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...row }),
      /*
       * Apps Script responde 302 hacia googleusercontent.com y el cuerpo real
       * viaja en la redirección. Sin seguirla, se interpretaría como fallo.
       */
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const data = (await response.json()) as { ok?: boolean; error?: string };
    return data?.ok ? { ok: true, error: null } : { ok: false, error: data?.error ?? 'respuesta inesperada' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
