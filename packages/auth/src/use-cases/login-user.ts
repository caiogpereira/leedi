import { auth } from '../auth.js';

export type LoginResult =
  | { success: true }
  | { success: false; error: string };

// Single generic error for ALL failure modes — never disclose which field is wrong.
const GENERIC_LOGIN_ERROR = 'E-mail ou senha incorretos';

/**
 * Authenticates a user via Better-Auth email+password.
 *
 * Security:
 * - All failure modes (wrong password, unknown email, unverified email) map to
 *   the identical generic message to prevent user enumeration.
 * - The caller is responsible for rate limiting (TODO: add Upstash Redis here).
 * - The session cookie is HttpOnly + Secure + SameSite=Lax (configured in auth.ts).
 *
 * TODO: add Upstash Redis rate limiting per IP + per email before exposing publicly.
 */
export async function loginUser(
  email: string,
  password: string,
  headers?: Headers
): Promise<LoginResult> {
  try {
    // Only spread `headers` when present: with exactOptionalPropertyTypes the
    // Better-Auth input type rejects an explicit `headers: undefined`.
    await auth.api.signInEmail({
      body: { email, password },
      ...(headers ? { headers } : {}),
    });
    return { success: true };
  } catch {
    // Intentionally swallow all error detail — return generic message only.
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }
}
