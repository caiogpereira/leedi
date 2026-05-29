import { z } from 'zod';
import { APIError } from 'better-auth/api';
import { passwordSchema } from '../schemas/password.js';
import { auth } from '../auth.js';

const registerSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: passwordSchema,
  name: z.string().min(1, 'Nome é obrigatório').optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterResult = { success: true } | { success: false; error: string };

const DUPLICATE_EMAIL_MESSAGE =
  'Este e-mail já está cadastrado. Faça login ou recupere sua senha.';
const GENERIC_ERROR_MESSAGE = 'Erro ao criar conta. Tente novamente.';

/**
 * Returns true when the thrown error represents a duplicate-email signup.
 * Better-Auth throws an APIError with body.code = USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL
 * (status UNPROCESSABLE_ENTITY). We match on the code first, then fall back to a
 * defensive string check.
 */
function isDuplicateEmailError(err: unknown): boolean {
  if (err instanceof APIError) {
    const code = err.body?.code;
    if (typeof code === 'string' && code.toUpperCase().includes('ALREADY_EXISTS')) {
      return true;
    }
  }
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('already') ||
    message.includes('exist') ||
    message.includes('duplicate')
  );
}

/**
 * Registers a new user via Better-Auth (email + password).
 *
 * Security: with `requireEmailVerification: true` and `autoSignIn: false`, no
 * session is created here — the user must verify their email first. We never log
 * the password or any token.
 *
 * TODO(Story 2.x security): add Upstash Redis rate limiting on this entry point
 * (per-IP and per-email) before exposing it publicly.
 */
export async function registerUser(input: RegisterInput): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Dados inválidos',
    };
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name ?? parsed.data.email,
        // AC#2: after the user clicks the verification link, Better-Auth marks
        // email_verified = true and redirects to this callback URL.
        callbackURL: '/login',
      },
    });
    return { success: true };
  } catch (err: unknown) {
    if (isDuplicateEmailError(err)) {
      return { success: false, error: DUPLICATE_EMAIL_MESSAGE };
    }
    return { success: false, error: GENERIC_ERROR_MESSAGE };
  }
}
