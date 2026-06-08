import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { db, schema } from '@leedi/db';
import { env } from '@leedi/config';
import { passwordSchema } from './schemas/password.js';

/**
 * Enforces the full password policy (Story 2.1 — min 8 + uppercase + digit) at
 * EVERY Better-Auth entry point, not just the app's Server Actions. The catch-all
 * `/api/auth/[...all]` route exposes the native `sign-up`/`reset-password`
 * endpoints directly; without this hook a client could POST a weak password
 * straight to them and bypass `registerUser`/`resetPassword`'s `passwordSchema`.
 * `minPasswordLength` below covers length at the native layer; this hook adds the
 * complexity rules Better-Auth has no native config for.
 */
const enforcePasswordPolicy = createAuthMiddleware(async (ctx) => {
  let candidate: unknown;
  if (ctx.path === '/sign-up/email') {
    candidate = (ctx.body as { password?: unknown } | undefined)?.password;
  } else if (ctx.path === '/reset-password') {
    candidate = (ctx.body as { newPassword?: unknown } | undefined)?.newPassword;
  } else {
    return;
  }
  const parsed = passwordSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new APIError('BAD_REQUEST', {
      message: parsed.error.issues[0]?.message ?? 'Senha inválida',
    });
  }
});

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
  advanced: {
    database: {
      generateId: 'uuid',
    },
    // Secure cookies + __Secure- prefix only in production (HTTPS).
    useSecureCookies: env.NODE_ENV === 'production',
  },
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
    // Length floor enforced at the native endpoints too (Story 2.1). Complexity
    // (uppercase + digit) is added by the `hooks.before` policy below, which
    // Better-Auth has no native config for.
    minPasswordLength: 8,
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
    // Story 2.2 Task 1: "remember me" -> 30-day persistent session. When the
    // login form leaves the box unchecked, Better-Auth issues a session cookie
    // (no max-age, cleared on browser close) regardless of this value — so this
    // 30-day lifetime applies to remembered sessions only.
    expiresIn: 60 * 60 * 24 * 30, // 30 days — AC#1 persistent (remember me)
    updateAge: 60 * 60 * 24, // refresh once per day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes client cache
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendVerificationEmail } = await import('./email-senders.js');
      await sendVerificationEmail(user.email, url);
    },
  },
  // Global request hook: enforce the password policy on the native endpoints
  // exposed by the catch-all route (see `enforcePasswordPolicy` above).
  hooks: {
    before: enforcePasswordPolicy,
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
 * For optimistic Edge checks use `hasSessionCookie` from `@leedi/auth/edge` instead.
 */
export async function getSession(headers: Headers) {
  return auth.api.getSession({ headers });
}
