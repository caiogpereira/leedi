import { auth } from '../auth.js';
import { passwordSchema } from '../schemas/password.js';
import type { ZodError } from 'zod';

export type ResetPasswordResult =
  | { success: true }
  | { success: false; error: string; expired?: boolean };

const EXPIRED_MESSAGE = 'Este link expirou. Solicite um novo link de recuperação.';
const GENERIC_MESSAGE = 'Erro ao redefinir senha. Tente novamente.';

/**
 * Detects whether a thrown Better-Auth error means the token is invalid/expired.
 *
 * Better-Auth throws an `APIError` carrying a stable `INVALID_TOKEN` code (the
 * reset route validates `verification.expiresAt < new Date()`). We match on the
 * code first; the free-text fallback only guards against shape changes.
 */
function isInvalidTokenError(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const code = (err as { body?: { code?: unknown }; code?: unknown }).body?.code ??
      (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.toUpperCase().includes('INVALID_TOKEN')) {
      return true;
    }
  }
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('not found')
  );
}

/**
 * Resets a user's password given a valid reset token (Story 2.3).
 *
 * After a successful reset, Better-Auth invalidates all existing sessions
 * (AC#2 — enabled via `revokeSessionsOnPasswordReset: true` in auth.ts). The
 * token is single-use: Better-Auth deletes the verification value once consumed.
 *
 * An already-expired link never reaches this code — Better-Auth's GET callback
 * redirects to `/reset-password?error=INVALID_TOKEN` first (handled by the page).
 * This catch only covers a token that expires while the form sits open (AC#3).
 *
 * TODO: add Upstash Redis rate limiting per token to prevent brute-force replay.
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<ResetPasswordResult> {
  // Validate password policy before calling the API.
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    const error = (parsed.error as ZodError).issues[0]?.message ?? 'Senha inválida';
    return { success: false, error };
  }

  try {
    await auth.api.resetPassword({
      body: { token, newPassword },
    });
    return { success: true };
  } catch (err: unknown) {
    if (isInvalidTokenError(err)) {
      return { success: false, error: EXPIRED_MESSAGE, expired: true };
    }
    return { success: false, error: GENERIC_MESSAGE };
  }
}
