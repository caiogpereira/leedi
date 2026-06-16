import { withServiceRole, schema, eq } from '@leedi/db';
import { randomBytes } from 'node:crypto';

export interface ProvisionSelfServeInput {
  userId: string;
  email: string;
  name?: string | null;
}

export type ProvisionSelfServeResult =
  | { provisioned: true; tenantId: string; slug: string }
  | { provisioned: false; reason: 'already_has_membership' };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Self-serve tenant provisioning (F-31).
 *
 * Runs from Better-Auth's `afterEmailVerification` hook — i.e. only once the
 * user has confirmed their email, so we never create orphan tenants for
 * never-verified signups. Creates a fresh workspace + a `trial` tenant + an
 * `owner` membership for the just-verified user, in one transaction via
 * `withServiceRole` (the user is not yet a member of any tenant, so RLS must be
 * bypassed to insert the first rows).
 *
 * The tenant is left WITHOUT `config.onboarding_config.onboarding_completed`, so
 * the dashboard (shell) layout routes the new owner into `/onboarding`
 * (Story 19.1 AC#1).
 *
 * Lives in @leedi/auth (not @leedi/tenancy) because it is auth-triggered and
 * @leedi/tenancy already depends on @leedi/auth — co-locating here avoids a
 * circular package dependency. It needs only @leedi/db.
 *
 * Idempotent: if the user already belongs to a tenant, it does nothing.
 */
export async function provisionSelfServeTenant(
  input: ProvisionSelfServeInput
): Promise<ProvisionSelfServeResult> {
  const { userId, email, name } = input;

  return withServiceRole(async (tx) => {
    const existing = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .where(eq(schema.memberships.userId, userId))
      .limit(1);
    if (existing.length > 0) {
      return { provisioned: false, reason: 'already_has_membership' };
    }

    const displayName = (name?.trim() || email.split('@')[0] || 'Workspace').slice(0, 60);

    // Resolve a unique slug — `tenants.slug` is NOT NULL UNIQUE. A short random
    // suffix avoids a collision-retry loop on common base names.
    const base = slugify(displayName) || 'workspace';
    const [slugClash] = await tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, base))
      .limit(1);
    const slug = slugClash ? `${base}-${randomBytes(3).toString('hex')}` : base;

    const [workspace] = await tx
      .insert(schema.workspaces)
      .values({ name: `${displayName} workspace` })
      .returning({ id: schema.workspaces.id });
    if (!workspace) throw new Error('Falha ao criar o workspace');

    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        workspaceId: workspace.id,
        name: displayName,
        slug,
        status: 'trial',
        plan: 'starter',
      })
      .returning({ id: schema.tenants.id, slug: schema.tenants.slug });
    if (!tenant) throw new Error('Falha ao criar o tenant');

    await tx.insert(schema.memberships).values({
      userId,
      tenantId: tenant.id,
      role: 'owner',
    });

    return { provisioned: true, tenantId: tenant.id, slug: tenant.slug };
  });
}
