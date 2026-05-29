import { auth } from '../auth.js';

/**
 * Destroys the session server-side.
 * Relies on Better-Auth's signOut to invalidate the session token in the DB.
 * Client-side cookie is cleared by the Set-Cookie header in the response.
 *
 * AC#2: a replayed token after logout must return 401 (server-side invalidation).
 */
export async function logoutUser(headers: Headers): Promise<void> {
  await auth.api.signOut({ headers });
}
