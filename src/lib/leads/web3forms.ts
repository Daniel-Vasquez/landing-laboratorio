import { optionalEnv } from '../env.ts';

/**
 * Envía el lead por correo con Web3Forms.
 *
 * Se llama desde el SERVIDOR. Web3Forms permite su clave en el cliente, pero
 * incluirla en el bundle deja que cualquiera use tu cuota y envíe correos con
 * tu remitente.
 *
 * A diferencia de Sheets, un fallo aquí SÍ se propaga: cuando el visitante
 * eligió correo, este envío es la entrega. Decirle que todo salió bien mientras
 * el correo no llegó le haría esperar una respuesta que nunca llegará.
 */
export async function sendLeadEmail(input: {
  destino: string;
  nombre: string;
  correo: string;
  motivo: string;
  estudio: string;
  plazo: string;
  origen: string;
}): Promise<void> {
  const accessKey = optionalEnv('WEB3FORMS_ACCESS_KEY');
  if (!accessKey) throw new Error('WEB3FORMS_ACCESS_KEY no está configurada.');

  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      /*
       * Web3Forms está detrás de Cloudflare y está pensado para envíos desde el
       * NAVEGADOR. Una petición servidor-a-servidor sin User-Agent tiene más
       * probabilidades de recibir el desafío de bots.
       *
       * NOTA: no se pudo verificar desde el entorno de desarrollo, donde
       * Cloudflare devuelve 403 incluso a un GET a la raíz de la API — bloquea
       * esa IP de salida, no la petición. Hay que comprobarlo desde Vercel tras
       * desplegar. Si allí también se bloquea, la alternativa es enviar desde el
       * cliente, que es el modelo para el que Web3Forms está diseñado y por el
       * que sus access keys son públicas por definición.
       */
      'User-Agent': 'landing-laboratorio/1.0 (+https://laboratorio.danielvasquez.lat)',
    },
    body: JSON.stringify({
      access_key: accessKey,
      subject: `Nuevo lead: ${input.nombre} — ${input.estudio}`,
      from_name: 'Landing Laboratorio Hospital Cristal',
      to: input.destino,
      // `replyTo` permite responder al paciente directamente desde el correo.
      replyto: input.correo,
      Nombre: input.nombre,
      Correo: input.correo,
      Motivo: input.motivo,
      Estudio: input.estudio,
      'Cuándo': input.plazo,
      'Sección de origen': input.origen,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Web3Forms respondió ${response.status}. ${body.slice(0, 160)}`);
  }

  const data = (await response.json()) as { success?: boolean; message?: string };
  if (!data?.success) throw new Error(data?.message ?? 'Web3Forms rechazó el envío.');
}
