import { auth } from '../auth.js';

/**
 * Requests a password reset for the given email (Story 2.3, AC#1).
 *
 * ALWAYS resolves without throwing — the response the caller surfaces must be
 * identical whether the email exists or not, to prevent user enumeration. The
 * underlying Better-Auth endpoint already sends an email only when an account
 * exists; we additionally swallow any internal error so timing/behaviour stays
 * uniform from the caller's perspective.
 *
 * `redirectTo` is where Better-Auth's GET /reset-password/:token callback sends
 * the user after validating the token: on success → `/reset-password?token=...`,
 * on an already-expired/invalid token → `/reset-password?error=INVALID_TOKEN`.
 *
 * TODO: add Upstash Redis rate limiting per IP + per email before public exposure.
 */
export async function requestPasswordReset(email: string, headers?: Headers): Promise<void> {
  try {
    await auth.api.requestPasswordReset({
      body: { email, redirectTo: '/reset-password' },
      ...(headers ? { headers } : {}),
    });
  } catch {
    // Swallow all errors — caller always sees success to prevent enumeration.
  }
}
