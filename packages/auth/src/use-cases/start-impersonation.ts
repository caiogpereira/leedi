import { db, schema } from '@leedi/db';
import { getWorkspaceAdmin } from '../workspace-guard.js';

const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1 hour — NOT renewable without re-auth.

export type StartImpersonationResult =
  | { success: true; expiresAt: number; workspaceId: string }
  | { success: false; error: string };

/**
 * Authorizes + starts impersonation for a super_admin (Story 2.8 AC#1).
 *
 * Only `super_admin` may impersonate — `support` is read-only by product decision
 * and is rejected here (defense: the entire point of impersonation is auditable
 * write-access, so it is gated to the highest-trust role).
 *
 * The real `workspaceId` is resolved from the `workspace_admins` row (NOT passed
 * in by the caller): `audit_logs.workspace_id` is a `uuid` column, so it must be
 * the genuine workspace UUID, never a placeholder.
 *
 * Writes the `impersonate_start` audit entry (append-only). The CALLER is
 * responsible for setting the session cookies (`leedi_impersonating`,
 * `leedi_real_user_id`, `leedi_tenant`) on the HTTP response.
 */
export async function startImpersonation(
  actorUserId: string,
  targetTenantId: string
): Promise<StartImpersonationResult> {
  const admin = await getWorkspaceAdmin(actorUserId);
  if (admin?.role !== 'super_admin') {
    return { success: false, error: 'Apenas super_admin pode impersonar tenants' };
  }

  const expiresAt = Date.now() + IMPERSONATION_TTL_MS;

  await db.insert(schema.auditLogs).values({
    workspaceId: admin.workspaceId,
    actorUserId,
    targetTenantId,
    acao: 'impersonate_start',
    detalhes: { expiresAt },
  });

  return { success: true, expiresAt, workspaceId: admin.workspaceId };
}
