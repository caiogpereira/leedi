import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the insert/values mock so we can assert on the audited payload, and a
// mutable holder for the `withServiceRole` tenant lookup result (the target-tenant
// EXISTENCE check — super_admin is platform-wide, so there is no workspace-scoping).
const { insertValues, tenantRowsRef, WORKSPACE_ID } = vi.hoisted(() => ({
  insertValues: vi.fn(),
  tenantRowsRef: { current: [] as Array<{ workspaceId: string }> },
  WORKSPACE_ID: '11111111-1111-1111-1111-111111111111',
}));

vi.mock('../workspace-guard.js', () => ({
  getWorkspaceAdmin: vi.fn(),
}));
vi.mock('@leedi/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: insertValues }),
  },
  // startImpersonation looks the target tenant up via withServiceRole to verify it
  // exists AND belongs to the admin's workspace before writing the audit row.
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({ where: () => ({ limit: () => tenantRowsRef.current }) }),
      }),
    })
  ),
  eq: vi.fn(),
  schema: { auditLogs: {}, tenants: { id: {}, workspaceId: {} } },
}));

import { getWorkspaceAdmin } from '../workspace-guard.js';
import { startImpersonation } from './start-impersonation.js';

const mockGetAdmin = vi.mocked(getWorkspaceAdmin);

describe('startImpersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockResolvedValue(undefined);
    // Default: the target tenant exists (workspace is irrelevant to authorization).
    tenantRowsRef.current = [{ workspaceId: WORKSPACE_ID }];
  });

  it('rejects the support role (only super_admin may impersonate)', async () => {
    mockGetAdmin.mockResolvedValueOnce({ role: 'support', workspaceId: WORKSPACE_ID });
    const result = await startImpersonation('u1', 'tenant-x');
    expect(result.success).toBe(false);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('rejects a non-admin user (null lookup)', async () => {
    mockGetAdmin.mockResolvedValueOnce(null);
    const result = await startImpersonation('u1', 'tenant-x');
    expect(result.success).toBe(false);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('succeeds for super_admin and sets a 1-hour expiry', async () => {
    mockGetAdmin.mockResolvedValueOnce({ role: 'super_admin', workspaceId: WORKSPACE_ID });
    const before = Date.now();
    const result = await startImpersonation('u1', 'tenant-x');
    expect(result.success).toBe(true);
    if (result.success) {
      // ~1 hour ahead (allow scheduling slack just under 3600s).
      expect(result.expiresAt).toBeGreaterThanOrEqual(before + 3_599_000);
      expect(result.workspaceId).toBe(WORKSPACE_ID);
    }
  });

  it('rejects a tenant that does not exist (no audit row written)', async () => {
    mockGetAdmin.mockResolvedValueOnce({ role: 'super_admin', workspaceId: WORKSPACE_ID });
    tenantRowsRef.current = []; // target tenant not found
    const result = await startImpersonation('u1', 'tenant-x');
    expect(result.success).toBe(false);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('succeeds across workspaces — super_admin is platform-wide (F-30)', async () => {
    // A tenant in a DIFFERENT workspace than the admin must still be impersonable:
    // self-serve signup gives every tenant its own workspace, so requiring a shared
    // workspace (the old behaviour) made impersonation impossible in practice.
    mockGetAdmin.mockResolvedValueOnce({ role: 'super_admin', workspaceId: WORKSPACE_ID });
    tenantRowsRef.current = [{ workspaceId: '22222222-2222-2222-2222-222222222222' }];
    const result = await startImpersonation('u1', 'tenant-x');
    expect(result.success).toBe(true);
    // Audit row is written under the ACTOR's workspace (mirrors blockTenant).
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, acao: 'impersonate_start' })
    );
  });

  it('writes an impersonate_start audit row with the REAL workspaceId (uuid)', async () => {
    mockGetAdmin.mockResolvedValueOnce({ role: 'super_admin', workspaceId: WORKSPACE_ID });
    await startImpersonation('super-1', 'tenant-x');
    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'super-1',
        targetTenantId: 'tenant-x',
        acao: 'impersonate_start',
      })
    );
  });
});
