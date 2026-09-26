import { z } from 'zod';

/**
 * Esquemas compartidos entre el formulario (React) y el servidor.
 * Una sola definición evita que la validación de cliente y la de servidor se
 * desincronicen — el caso clásico en que el cliente acepta algo que el
 * servidor rechaza con un 500 sin mensaje útil.
 */

export const PASSWORD_MIN = 10;

export const signInSchema = z.object({
  email: z.email({ message: 'Introduce un correo válido.' }),
  password: z
    .string()
    .min(1, { message: 'Introduce tu contraseña.' })
    .max(128, { message: 'La contraseña es demasiado larga.' }),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: 'Introduce tu nombre.' })
    .max(80, { message: 'El nombre es demasiado largo.' }),
  email: z.email({ message: 'Introduce un correo válido.' }),
  password: z
    .string()
    .min(PASSWORD_MIN, { message: `Usa al menos ${PASSWORD_MIN} caracteres.` })
    .max(128, { message: 'La contraseña es demasiado larga.' }),
  inviteCode: z.string().max(200).optional(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
