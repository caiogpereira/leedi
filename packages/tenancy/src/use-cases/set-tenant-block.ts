import { withServiceRole, schema, eq } from '@leedi/db';
import { writeAuditLog } from './write-audit-log.js';

export interface BlockTenantInput {
  tenantId: string;
  /** Real workspace UUID resolved from the actor's `workspace_admins` row. */
  workspaceId: string;
  /** The super-admin performing the action (audit attribution). */
  actorUserId: string;
  /** Required, human-meaningful reason persisted to the audit log. */
  reason: string;
}

/**
 * Manually blocks a tenant (Story 20.2 AC#4).
 *
 * Flips `tenants.status` to the English enum value `blocked` and appends a
 * `manual_block` audit entry. The agent read path already aborts processing when
 * `tenants.status === 'blocked'` (`packages/agent/.../process-message.ts`), so the
 * status flip alone stops new-message handling — no extra wiring needed.
 *
 * The status is the SAME value the automated billing lock (Story 17.2) sets; the
 * two are distinguished ONLY by `audit_logs.acao` (`manual_block` vs `billing_lock`),
 * per the story's pitfall.
 *
 * SECURITY: writes across tenants via `withServiceRole`; only call after verifying
 * the caller is a `super_admin` workspace admin.
 */
export async function blockTenant(input: BlockTenantInput): Promise<void> {
  await withServiceRole((tx) =>
    tx
      .update(schema.tenants)
      .set({ status: 'blocked' })
      .where(eq(schema.tenants.id, input.tenantId))
  );

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    targetTenantId: input.tenantId,
    acao: 'manual_block',
    detalhes: { reason: input.reason, blocked_by: input.actorUserId },
  });
}

/**
 * Force-releases a blocked tenant back to active (Story 20.2 AC#5).
 *
 * Flips `tenants.status` to `active` and appends a `manual_unblock` audit entry;
 * the agent path resumes processing immediately once status is no longer `blocked`.
 *
 * SECURITY: same posture as `blockTenant`.
 */
export async function unblockTenant(input: BlockTenantInput): Promise<void> {
  await withServiceRole((tx) =>
    tx
      .update(schema.tenants)
      .set({ status: 'active' })
      .where(eq(schema.tenants.id, input.tenantId))
  );

  await writeAuditLog({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    targetTenantId: input.tenantId,
    acao: 'manual_unblock',
    detalhes: { reason: input.reason, unblocked_by: input.actorUserId },
  });
}
