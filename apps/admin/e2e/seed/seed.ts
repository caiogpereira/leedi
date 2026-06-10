import { db, schema, eq, inArray } from '@leedi/db';
import { auth } from '@leedi/auth';
import { E2E_ADMIN_WORKSPACE, E2E_PASSWORD, E2E_SUPER_ADMIN } from './constants.js';

/**
 * Seeds the `[E2E]` admin namespace (workspace → super_admin user → credential
 * account → workspace_admins) via the privileged `db` connection (BYPASSRLS).
 *
 * The admin (shell) layout guards on `getWorkspaceAdminRole(userId) ===
 * 'super_admin'`, which reads `workspace_admins` (workspace-guard.ts) — so the
 * workspace_admins row is what lets the seeded user past the guard.
 *
 * Password hash via Better-Auth's own context (not signUpEmail, which would fire a
 * verification email to a `.test` address). User is created `email_verified` so
 * `signInEmail` proceeds without the verification gate.
 *
 * Idempotent: callers pre-clean first, but inserts also tolerate a conflict.
 */
export async function seedSuperAdmin(): Promise<void> {
  await db
    .insert(schema.workspaces)
    .values({ id: E2E_ADMIN_WORKSPACE.id, name: E2E_ADMIN_WORKSPACE.name })
    .onConflictDoNothing();

  await db
    .insert(schema.users)
    .values({
      id: E2E_SUPER_ADMIN.id,
      email: E2E_SUPER_ADMIN.email,
      name: E2E_SUPER_ADMIN.name,
      emailVerified: true,
    })
    .onConflictDoNothing();

  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(E2E_PASSWORD);

  await db
    .insert(schema.accounts)
    .values({
      userId: E2E_SUPER_ADMIN.id,
      accountId: E2E_SUPER_ADMIN.id,
      providerId: 'credential',
      password: passwordHash,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.workspaceAdmins)
    .values({
      userId: E2E_SUPER_ADMIN.id,
      workspaceId: E2E_ADMIN_WORKSPACE.id,
      role: 'super_admin',
    })
    .onConflictDoNothing();
}

/**
 * Deletes ONLY the `[E2E]` admin namespace, by fixed id, in FK-safe order.
 *
 * `workspace_admins` references users/workspace WITHOUT cascade → first.
 * Deleting the user cascades its accounts/sessions (onDelete: 'cascade').
 * Then the workspace. Never touches any row outside the namespace.
 */
export async function cleanupAdminNamespace(): Promise<void> {
  await db
    .delete(schema.workspaceAdmins)
    .where(eq(schema.workspaceAdmins.userId, E2E_SUPER_ADMIN.id));
  await db.delete(schema.users).where(inArray(schema.users.id, [E2E_SUPER_ADMIN.id]));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, E2E_ADMIN_WORKSPACE.id));
}
