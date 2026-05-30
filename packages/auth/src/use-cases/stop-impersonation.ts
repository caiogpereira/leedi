import { db, schema } from '@leedi/db';
import { getWorkspaceAdmin } from '../workspace-guard.js';

export type StopImpersonationResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Writes the `impersonate_end` audit entry (Story 2.8 AC#3), restoring the
 * workspace-admin context. The CALLER must clear the impersonation cookies
 * (`leedi_impersonating`, `leedi_real_user_id`, `leedi_tenant`) regardless of the
 * outcome here — failing to log must never trap the admin in the tenant context.
 *
 * The real `workspaceId` is resolved from the actor's `workspace_admins` row so
 * the `uuid` column receives a genuine value (mirrors `startImpersonation`).
 *
 * If the actor is no longer a workspace admin (record removed mid-session), there
 * is nothing to attribute and no impersonation could have been authorized, so we
 * return a soft failure and let the caller clear cookies anyway (fail-open on
 * EXIT — staying scoped to a tenant would be the more dangerous outcome).
 */
export async function stopImpersonation(
  actorUserId: string,
  targetTenantId: string
): Promise<StopImpersonationResult> {
  const admin = await getWorkspaceAdmin(actorUserId);
  if (!admin) {
    return { success: false, error: 'Ator não é mais um workspace admin' };
  }

  await db.insert(schema.auditLogs).values({
    workspaceId: admin.workspaceId,
    actorUserId,
    targetTenantId,
    acao: 'impersonate_end',
    detalhes: null,
  });

  return { success: true };
}
