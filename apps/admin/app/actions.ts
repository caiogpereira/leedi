'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { logoutUser } from '@leedi/auth';
import { env } from '@leedi/config';

/**
 * Logs the super-admin out by destroying the session server-side (AC#2), then
 * redirects to the login page on the web app origin.
 *
 * The session cookie is host-scoped (shared across ports on localhost), so the
 * Set-Cookie that `logoutUser` clears via Better-Auth's `nextCookies()` bridge
 * applies to the cookie the web app set on :3000. `/login` lives on the web app
 * (BETTER_AUTH_URL), not this admin app — an absolute URL is required (F-29).
 * redirect() throws internally (NEXT_REDIRECT) — never wrap it in try/catch.
 */
export async function logoutAction(): Promise<void> {
  const requestHeaders = await headers();
  await logoutUser(requestHeaders);
  redirect(`${env.BETTER_AUTH_URL}/login`);
}
