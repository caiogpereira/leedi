import { withServiceRole, schema, eq } from '@leedi/db';
import { randomBytes } from 'node:crypto';
import { inviteMember } from './invite-member.js';

export interface CreateTenantInput {
  name: string;
  ownerEmail: string;
  plano: 'starter' | 'pro' | 'enterprise';
  /** Real workspace UUID resolved from the actor's `workspace_admins` row. */
  workspaceId: string;
  /** The super-admin creating the tenant — recorded as the invitation's inviter. */
  invitedByUserId: string;
}

export type CreateTenantResult =
  | { success: true; tenantId: string; slug: string }
  | { success: false; error: string };

function slugify(name: string): string {
  // Accented chars fall outside [a-z0-9] and collapse to a separator, which is
  // fine for a slug — no Unicode normalization needed.
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Resolves a unique slug for `name`. Falls back to a short random suffix when the
 * base slug (or an empty base) collides — `tenants.slug` is `NOT NULL UNIQUE`.
 */
async function resolveUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'tenant';
  const [existing] = await withServiceRole((tx) =>
    tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, base))
      .limit(1)
  );
  if (!existing) return base;
  return `${base}-${randomBytes(3).toString('hex')}`;
}

/**
 * Creates a tenant and invites its owner (Story 20.2 AC#2).
 *
 * The owner's account and `owner` membership are NOT created here: Better-Auth
 * provisions the account only at invite-acceptance (`acceptInvitation` →
 * `signUpEmail`). Pre-inserting a `users` row would leave the owner with no
 * credential account and an unusable login, so we reuse the Epic 2.6 invite flow
 * (`inviteMember`) exactly — the owner accepts the email link, which creates both
 * the account and the membership.
 *
 * Billing (Story 17.1 `createBillingForTenant`) is intentionally NOT called here:
 * it lives in `@leedi/billing` and needs a `PaymentProvider`, so the apps/admin
 * caller orchestrates it after this use-case returns — mirroring the
 * apps-layer-orchestrates pattern used elsewhere (e.g. usage→notification).
 *
 * SECURITY: inserts via `withServiceRole`; only call after verifying the caller is
 * a `super_admin` workspace admin. The invitation insert runs inside
 * `withTenant(newTenantId)` (set by `inviteMember`), so RLS is satisfied without
 * the super-admin being a member of the new tenant.
 */
export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const { name, ownerEmail, plano, workspaceId, invitedByUserId } = input;

  const slug = await resolveUniqueSlug(name);

  const [tenant] = await withServiceRole((tx) =>
    tx
      .insert(schema.tenants)
      .values({ workspaceId, name, slug, status: 'trial', plan: plano })
      .returning({ id: schema.tenants.id, slug: schema.tenants.slug })
  );

  if (!tenant) {
    return { success: false, error: 'Falha ao criar o tenant' };
  }

  // Reuse the Epic 2.6 invite flow. `inviterRole: 'owner'` passes the team:manage
  // permission check; the insert runs under withTenant(tenant.id), so RLS is met.
  const invited = await inviteMember({
    email: ownerEmail,
    role: 'owner',
    tenantId: tenant.id,
    invitedByUserId,
    inviterRole: 'owner',
  });

  if (!invited.success) {
    // Tenant already exists; surface the invite failure so the admin can resend.
    return { success: false, error: invited.error };
  }

  return { success: true, tenantId: tenant.id, slug: tenant.slug };
}
