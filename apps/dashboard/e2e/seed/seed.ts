import { db, schema, eq, inArray } from '@leedi/db';
import { auth } from '@leedi/auth';
import { E2E_OWNER, E2E_PASSWORD, E2E_TENANT, E2E_WORKSPACE } from './constants.js';

/**
 * Seeds the `[E2E]` namespace (workspace → tenant → owner user → credential
 * account → membership) directly via the privileged `db` connection (BYPASSRLS).
 *
 * The credential password hash is produced through Better-Auth's own context
 * (`auth.$context.password.hash`) — NOT a hand-rolled scrypt and NOT `signUpEmail`
 * (which would fire `sendVerificationEmail` → Resend → a bounce on the `.test`
 * TLD). The user is created already `email_verified` so `signInEmail` proceeds
 * without the verification gate (auth.ts: requireEmailVerification: true).
 *
 * The tenant is seeded `active` (not the `trial` default) so the (shell) layout
 * renders directly instead of redirecting trial+unfinished-onboarding tenants to
 * /onboarding (see apps/dashboard/app/(shell)/layout.tsx).
 *
 * Idempotent: callers pre-clean first, but every insert also tolerates a conflict.
 */
export async function seedOwner(): Promise<void> {
  await db
    .insert(schema.workspaces)
    .values({ id: E2E_WORKSPACE.id, name: E2E_WORKSPACE.name })
    .onConflictDoNothing();

  await db
    .insert(schema.tenants)
    .values({
      id: E2E_TENANT.id,
      workspaceId: E2E_WORKSPACE.id,
      name: E2E_TENANT.name,
      slug: E2E_TENANT.slug,
      status: 'active',
      plan: 'starter',
      config: { onboarding_config: { onboarding_completed: true } },
    })
    .onConflictDoNothing();

  await db
    .insert(schema.users)
    .values({
      id: E2E_OWNER.id,
      email: E2E_OWNER.email,
      name: E2E_OWNER.name,
      emailVerified: true,
    })
    .onConflictDoNothing();

  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(E2E_PASSWORD);

  // Better-Auth credential accounts use accountId = user.id, providerId 'credential'.
  await db
    .insert(schema.accounts)
    .values({
      userId: E2E_OWNER.id,
      accountId: E2E_OWNER.id,
      providerId: 'credential',
      password: passwordHash,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.memberships)
    .values({
      userId: E2E_OWNER.id,
      tenantId: E2E_TENANT.id,
      role: 'owner',
    })
    .onConflictDoNothing();
}

/**
 * Deletes ONLY the `[E2E]` namespace, by fixed id, in FK-safe order.
 *
 * `memberships` references users/tenants WITHOUT cascade, so it goes first.
 * `accounts` and `sessions` cascade off `users.id` (onDelete: 'cascade'), so
 * deleting the user clears them. Then tenant, then workspace.
 *
 * Never touches any row outside the namespace.
 */
export async function cleanupNamespace(): Promise<void> {
  await db.delete(schema.memberships).where(eq(schema.memberships.userId, E2E_OWNER.id));
  await db.delete(schema.users).where(inArray(schema.users.id, [E2E_OWNER.id]));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, E2E_TENANT.id));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, E2E_WORKSPACE.id));
}
