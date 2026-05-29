import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getSessionCookie } from 'better-auth/cookies';
import { nextCookies } from 'better-auth/next-js';
import { db, schema } from '@leedi/db';
import { env } from '@leedi/config';

/**
 * Better-Auth instance for Leedi.
 *
 * Schema mapping: Better-Auth's default models (user/account/session/verification)
 * are mapped onto our Drizzle tables. Credential password hashes live in `accounts`
 * (providerId = 'credential'), NOT on the user row — so we do NOT declare a
 * passwordHash additional field here.
 *
 * Email verification: `emailVerification.sendVerificationEmail` is the hook
 * Better-Auth calls during sign-up (see better-auth sign-up route). With
 * `requireEmailVerification: true` + `autoSignIn: false`, the user must verify
 * before any session is created.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: 'pg',
    // Explicit model→table mapping below is authoritative; no name inference needed.
    schema: {
      user: schema.users,
      account: schema.accounts,
      session: schema.sessions,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    // Reset-password token lifetime (Story 2.3 AC#1): 60 minutes, in seconds.
    resetPasswordTokenExpiresIn: 60 * 60,
    // AC#2: invalidate ALL existing sessions after a successful reset. This is
    // OFF by default in Better-Auth — the reset would otherwise succeed silently
    // while leaving stale sessions valid. Verified against the route source:
    // `if (...revokeSessionsOnPasswordReset) await ...deleteSessions(userId)`.
    revokeSessionsOnPasswordReset: true,
    // Called by Better-Auth's /request-password-reset endpoint ONLY when an
    // account exists for the email — the enumeration-safe success message is
    // returned by the endpoint regardless (AC#1). Never logs `url` (token).
    sendResetPassword: async ({ user, url }) => {
      const { sendResetPasswordEmail } = await import('./email-senders.js');
      await sendResetPasswordEmail(user.email, url);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days default — AC#1 persistent session
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes client cache
    },
  },
  advanced: {
    // Secure cookies + __Secure- prefix only in production (HTTPS).
    useSecureCookies: env.NODE_ENV === 'production',
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      // Dynamic import avoids pulling the notification/render graph into the
      // module's eager import chain.
      const { sendVerificationEmail } = await import('./email-senders.js');
      await sendVerificationEmail(user.email, url);
    },
  },
  // nextCookies bridges Better-Auth's Set-Cookie headers into next/headers
  // cookies() so that auth.api.* calls made from Server Actions (login/logout)
  // actually persist/clear the session cookie. MUST be the last plugin.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;

/**
 * Server-side session getter for Server Components and Route Handlers (Node runtime).
 *
 * This performs a full DB-backed validation of the session token. Do NOT call it
 * from Edge middleware — the Drizzle/pg adapter cannot run on the Edge runtime.
 * For optimistic Edge checks use `hasSessionCookie` instead.
 */
export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}

/**
 * Edge-safe optimistic auth check for middleware.
 *
 * Returns true when a Better-Auth session cookie is present on the request. It
 * only inspects the cookie (no DB call), so it is safe in the Edge runtime. Real
 * validation still happens server-side via `getSession`; this just gates routing.
 *
 * It auto-detects the `__Secure-` cookie prefix from the request protocol, so it
 * stays consistent with `advanced.useSecureCookies` above.
 */
export function hasSessionCookie(request: Request | Headers): boolean {
  return getSessionCookie(request) !== null;
}
