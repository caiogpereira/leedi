import { db, schema } from '@leedi/db';

export interface AuditLogEntry {
  workspaceId: string;
  actorUserId: string;
  targetTenantId?: string | null;
  acao: string;
  detalhes?: Record<string, unknown> | null;
}

/**
 * Inserts an immutable audit log entry. Append-only — no UPDATE or DELETE ever
 * (Story 2.4 enforces this at the DB grant level; the application never issues a
 * mutating statement against `audit_logs`).
 *
 * Uses `db` directly (not `withTenant`) — `audit_logs` is workspace-scoped, not
 * tenant-scoped: it records actions ACROSS tenants (e.g. a super-admin's writes
 * while impersonating), so it must not be confined to a single `app.tenant_id`.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  await db.insert(schema.auditLogs).values({
    workspaceId: entry.workspaceId,
    actorUserId: entry.actorUserId,
    targetTenantId: entry.targetTenantId ?? null,
    acao: entry.acao,
    detalhes: entry.detalhes ?? null,
  });
}
