import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Cookie } from '@playwright/test';
import { auth } from '@leedi/auth';
import { E2E_OWNER, E2E_PASSWORD, STORAGE_STATE_OWNER } from './seed/constants.js';
import { cleanupNamespace, seedOwner } from './seed/seed.js';

const _dir = dirname(fileURLToPath(import.meta.url));

/**
 * Phase 2 global setup (runs ONLY when E2E_AUTH is set).
 *
 *   1. Scoped pre-clean + seed of the `[E2E]` namespace (idempotent).
 *   2. Mint a REAL signed session via Better-Auth's server API and persist it as
 *      Playwright storageState, so the `auth` project starts already logged in.
 *
 * Why server-API minting (not a UI login through the :3000 web app): the dashboard
 * webServer only boots :3001; the login app is not running. The session cookie is
 * `token.signature` (HMAC) — it cannot be rebuilt from the DB `sessions.token`
 * alone, so we let Better-Auth produce it. The same `BETTER_AUTH_SECRET` validates
 * it on the dashboard regardless of which port issued the Set-Cookie.
 */
export default async function globalSetup(): Promise<void> {
  await cleanupNamespace();
  await seedOwner();

  const response = await auth.api.signInEmail({
    body: { email: E2E_OWNER.email, password: E2E_PASSWORD, rememberMe: true },
    asResponse: true,
  });

  // getSetCookie() returns each Set-Cookie as its own entry — do NOT use
  // headers.get('set-cookie'), which comma-joins and corrupts expiry dates.
  const setCookies = response.headers.getSetCookie();
  const cookies: Cookie[] = setCookies
    .map((raw) => {
      const first = raw.split(';', 1)[0] ?? '';
      const eq = first.indexOf('=');
      if (eq === -1) return null;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      // Keep only Better-Auth cookies with a real value (skip clears/CSRF noise).
      if (!name.startsWith('better-auth') || value === '') return null;
      return {
        name,
        value,
        domain: 'localhost',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
      } satisfies Cookie;
    })
    .filter((c): c is Cookie => c !== null);

  if (!cookies.some((c) => c.name.includes('session_token'))) {
    throw new Error(
      `E2E global-setup: no session_token cookie in sign-in response (got: ${
        setCookies.map((c) => c.split('=', 1)[0]).join(', ') || 'none'
      }). Check BETTER_AUTH_SECRET / emailVerified seed.`
    );
  }

  const out = resolve(_dir, STORAGE_STATE_OWNER.replace(/^e2e\//, ''));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ cookies, origins: [] }, null, 2));
}
