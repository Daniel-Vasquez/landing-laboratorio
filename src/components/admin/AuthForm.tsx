import { useId, useState, type ReactNode, type SubmitEvent } from 'react';
import { authClient } from '../../lib/auth-client';
import { signInSchema, signUpSchema, PASSWORD_MIN } from '../../lib/auth-schemas';

type Mode = 'login' | 'signup';
type FieldErrors = Partial<Record<'name' | 'email' | 'password' | 'inviteCode', string>>;

interface Props {
  mode: Mode;
  /** Ruta a la que volver tras un login exitoso. Ya validada en el servidor. */
  redirectTo: string;
  /** El servidor exige código de invitación (SIGNUP_INVITE_CODE tiene valor). */
  requireInviteCode?: boolean;
}

export default function AuthForm({ mode, redirectTo, requireInviteCode = false }: Props) {
  const [values, setValues] = useState({ name: '', email: '', password: '', inviteCode: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const ids = {
    name: useId(),
    email: useId(),
    password: useId(),
    inviteCode: useId(),
    formError: useId(),
  };

  const isSignup = mode === 'signup';

  function update(field: keyof typeof values, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Limpia el error del campo en cuanto el usuario lo corrige.
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  // React 19 deprecó `FormEvent` ("no existe realmente") a favor de los
  // tipos de evento concretos; para un submit el correcto es `SubmitEvent`.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Misma validación que el servidor: los esquemas se comparten (auth-schemas.ts).
    const schema = isSignup ? signUpSchema : signInSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    if (isSignup && requireInviteCode && values.inviteCode.trim() === '') {
      setFieldErrors({ inviteCode: 'Introduce el código de invitación.' });
      return;
    }

    setSubmitting(true);
    try {
      const result = isSignup
        ? await authClient.signUp.email({
            name: values.name.trim(),
            email: values.email,
            password: values.password,
            ...(requireInviteCode ? { inviteCode: values.inviteCode } : {}),
          } as Parameters<typeof authClient.signUp.email>[0])
        : await authClient.signIn.email({
            email: values.email,
            password: values.password,
          });

      if (result.error) {
        // NUNCA distinguir "el correo no existe" de "la contraseña es incorrecta":
        // eso permite enumerar qué cuentas existen. Mensaje único en login.
        setFormError(
          isSignup
            ? (result.error.message ?? 'No se pudo crear la cuenta.')
            : 'Correo o contraseña incorrectos.',
        );
        return;
      }

      // Recarga completa en lugar de navegación en cliente: el middleware debe
      // leer la cookie de sesión recién puesta para autorizar /admin.
      window.location.href = redirectTo;
    } catch (error) {
      setFormError(
        error instanceof Error
          ? `No se pudo completar la operación: ${error.message}`
          : 'No se pudo completar la operación.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    [
      'w-full rounded-lg border bg-bg px-3.5 py-2.5 text-sm text-fg',
      'placeholder:text-fg-muted/70',
      hasError ? 'border-red-500' : 'border-border',
    ].join(' ');

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && (
        <p
          id={ids.formError}
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {formError}
        </p>
      )}

      {isSignup && (
        <Field
          id={ids.name}
          label="Nombre"
          error={fieldErrors.name}
          hint="Es el nombre que aparecerá como autor de los cambios."
        >
          <input
            id={ids.name}
            name="name"
            type="text"
            autoComplete="name"
            required
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? `${ids.name}-error` : undefined}
            className={inputClass(Boolean(fieldErrors.name))}
          />
        </Field>
      )}

      <Field id={ids.email} label="Correo electrónico" error={fieldErrors.email}>
        <input
          id={ids.email}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={values.email}
          onChange={(e) => update('email', e.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? `${ids.email}-error` : undefined}
          className={inputClass(Boolean(fieldErrors.email))}
        />
      </Field>

      <Field
        id={ids.password}
        label="Contraseña"
        error={fieldErrors.password}
        hint={isSignup ? `Mínimo ${PASSWORD_MIN} caracteres.` : undefined}
      >
        <input
          id={ids.password}
          name="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          required
          value={values.password}
          onChange={(e) => update('password', e.target.value)}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? `${ids.password}-error` : undefined}
          className={inputClass(Boolean(fieldErrors.password))}
        />
      </Field>

      {isSignup && requireInviteCode && (
        <Field id={ids.inviteCode} label="Código de invitación" error={fieldErrors.inviteCode}>
          <input
            id={ids.inviteCode}
            name="inviteCode"
            type="text"
            autoComplete="off"
            required
            value={values.inviteCode}
            onChange={(e) => update('inviteCode', e.target.value)}
            aria-invalid={Boolean(fieldErrors.inviteCode)}
            aria-describedby={fieldErrors.inviteCode ? `${ids.inviteCode}-error` : undefined}
            className={inputClass(Boolean(fieldErrors.inviteCode))}
          />
        </Field>
      )}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? isSignup
            ? 'Creando cuenta…'
            : 'Entrando…'
          : isSignup
            ? 'Crear cuenta'
            : 'Entrar'}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {/* <label for> real, no placeholder como etiqueta. */}
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
