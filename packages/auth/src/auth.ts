import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
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
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
