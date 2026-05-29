import { auth } from '../auth.js';

export type LoginResult =
  | { success: true }
  | { success: false; error: string };

export interface LoginOptions {
  /** Forwarded request headers so Better-Auth can read cookies / client info. */
  headers?: Headers;
  /**
   * When true the session uses the long-lived `expiresIn` cookie (persists across
   * browser restarts — AC#1). When false it becomes a session cookie cleared on
   * browser close. Defaults to Better-Auth's default (true) when omitted.
   */
  rememberMe?: boolean;
}

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
  options: LoginOptions = {}
): Promise<LoginResult> {
  const { headers, rememberMe } = options;
  try {
    // Only spread `headers`/`rememberMe` when present: with
    // exactOptionalPropertyTypes the Better-Auth input type rejects an explicit
    // `undefined` for these properties.
    await auth.api.signInEmail({
      body: {
        email,
        password,
        ...(rememberMe === undefined ? {} : { rememberMe }),
      },
      ...(headers ? { headers } : {}),
    });
    return { success: true };
  } catch {
    // Intentionally swallow all error detail — return generic message only.
    return { success: false, error: GENERIC_LOGIN_ERROR };
  }
}
