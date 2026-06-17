import { db, withServiceRole, schema, eq } from '@leedi/db';
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
 * `super_admin` is a PLATFORM-WIDE role: it may impersonate ANY tenant, exactly
 * like the cross-workspace block/unblock and the global tenant list already do
 * (`listAllTenantsDetailed`, `blockTenant`). Tenant↔workspace scoping is NOT a
 * constraint here — self-serve signup gives every tenant its own workspace, so a
 * tenant almost never shares the admin's workspace, and an earlier same-workspace
 * check made impersonation impossible in practice (F-30).
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

  // Verify the target tenant EXISTS before writing the audit row or returning
  // success — a well-formed but nonexistent tenant UUID would otherwise set
  // impersonation cookies for nothing and pollute the audit trail. We do NOT
  // require it to share the admin's workspace (platform-wide role — see above).
  // Service-role read because the admin is not a member of the target tenant.
  const [tenant] = await withServiceRole(async (tx) =>
    tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, targetTenantId))
      .limit(1)
  );
  if (!tenant) {
    return { success: false, error: 'Tenant não encontrado' };
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
