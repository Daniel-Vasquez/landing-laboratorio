import { getDb } from './mongo.ts';
import { getLastChange, type LastChange } from './audit.ts';

/**
 * Lectura de las cuentas con acceso al panel. SOLO LECTURA.
 *
 * Crear, editar o borrar cuentas queda deliberadamente fuera de alcance: el
 * requerimiento pide una vista que indique quién hizo el último cambio, y el
 * alta se controla con ALLOW_PUBLIC_SIGNUP. Añadir borrado de usuarios sería
 * una superficie de daño que nadie pidió.
 */

export type AccountSummary = {
  name: string;
  email: string;
  createdAt: Date | null;
};

export type UsersView = {
  ok: boolean;
  error: string | null;
  lastChange: LastChange | null;
  accounts: AccountSummary[];
};

export async function getUsersView(): Promise<UsersView> {
  try {
    const db = await getDb();

    /**
     * Proyección explícita con `_id: 0`.
     *
     * Enumerar los campos deseados NO basta: MongoDB incluye `_id` por defecto
     * salvo que se excluya. Sin esto, el ObjectId de cada cuenta acabaría en el
     * HTML servido. No es una credencial, pero es un identificador interno que
     * la vista no necesita, y publicarlo solo amplía la superficie.
     *
     * Lo importante: `password` (en `account`) y `providerId` nunca se leen aquí.
     */
    const accounts = (await db
      .collection('user')
      .find({}, { projection: { _id: 0, name: 1, email: 1, createdAt: 1 }, sort: { createdAt: 1 } })
      .toArray()) as unknown as AccountSummary[];

    return {
      ok: true,
      error: null,
      lastChange: await getLastChange(),
      accounts,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      lastChange: null,
      accounts: [],
    };
  }
}
