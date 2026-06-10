import { withTenant, schema, eq, and, isNull, gt } from '@leedi/db';
import type { TenantRole } from '@leedi/auth';

export interface PendingInvitation {
  email: string;
  role: TenantRole;
  expiresAt: Date;
}

/**
 * Lists a tenant's PENDING invitations (Story 2.6 AC#1 — "Pendente" rows).
 *
 * Pending == not yet accepted AND not expired. Runs under `withTenant` so the
 * `invitations` RLS policy scopes to this tenant. Mirrors the duplicate-pending
 * predicate used by `inviteMember` (an expired-but-unaccepted row is NOT shown —
 * it can no longer be redeemed).
 */
export async function listPendingInvitations(tenantId: string): Promise<PendingInvitation[]> {
  return withTenant(tenantId, async (tx) =>
    tx
      .select({
        email: schema.invitations.email,
        role: schema.invitations.role,
        expiresAt: schema.invitations.expiresAt,
      })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.tenantId, tenantId),
          isNull(schema.invitations.acceptedAt),
          gt(schema.invitations.expiresAt, new Date())
        )
      )
  );
}
