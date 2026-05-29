'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { logoutUser } from '@leedi/auth';

/**
 * Logs the user out by destroying the session server-side (AC#2), then redirects
 * to the login page.
 *
 * NOTE: `/login` lives on the web app (port 3000). In the current same-origin
 * dev setup a relative redirect resolves correctly; a cross-origin absolute URL
 * will be needed once the apps are split. redirect() throws internally
 * (NEXT_REDIRECT) — never wrap it in try/catch.
 */
export async function logoutAction(): Promise<void> {
  const requestHeaders = await headers();
  await logoutUser(requestHeaders);
  redirect('/login');
}
