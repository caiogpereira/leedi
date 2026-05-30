import { db, schema, eq } from '@leedi/db';
import type { WorkspaceRole } from './rbac.js';

export interface WorkspaceAdmin {
  role: WorkspaceRole;
  workspaceId: string;
}

/**
 * Resolves the workspace-admin record for `userId` from `workspace_admins`,
 * returning both the role and the (real) `workspaceId`, or `null` if the user is
 * not a workspace admin.
 *
 * The `workspaceId` is returned deliberately: every audit-log insert needs the
 * real workspace UUID (`audit_logs.workspace_id` is `uuid`), and this lookup —
 * already required for authorization — is the single source of truth for it.
 *
 * `.limit(1)` assumes one workspace membership per admin, which holds for the
 * single-workspace MVP. Revisit if a staff member ever spans workspaces.
 */
export async function getWorkspaceAdmin(userId: string): Promise<WorkspaceAdmin | null> {
  const [admin] = await db
    .select({
      role: schema.workspaceAdmins.role,
      workspaceId: schema.workspaceAdmins.workspaceId,
    })
    .from(schema.workspaceAdmins)
    .where(eq(schema.workspaceAdmins.userId, userId))
    .limit(1);

  if (!admin) {
    return null;
  }

  return {
    role: admin.role as WorkspaceRole,
    workspaceId: admin.workspaceId,
  };
}

/**
 * Returns just the workspace role for `userId`, or `null` if not a workspace
 * admin. Convenience wrapper over `getWorkspaceAdmin` for callers that only gate
 * on the role (e.g. route guards) and don't need the workspaceId.
 */
export async function getWorkspaceAdminRole(userId: string): Promise<WorkspaceRole | null> {
  const admin = await getWorkspaceAdmin(userId);
  return admin?.role ?? null;
}
