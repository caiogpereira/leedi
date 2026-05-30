import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insertValues } = vi.hoisted(() => ({ insertValues: vi.fn() }));

vi.mock('../workspace-guard.js', () => ({
  getWorkspaceAdmin: vi.fn(),
}));
vi.mock('@leedi/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: insertValues.mockResolvedValue(undefined),
    }),
  },
  schema: { auditLogs: {} },
}));

import { getWorkspaceAdmin } from '../workspace-guard.js';
import { stopImpersonation } from './stop-impersonation.js';

const mockGetAdmin = vi.mocked(getWorkspaceAdmin);
const WORKSPACE_ID = '22222222-2222-2222-2222-222222222222';

describe('stopImpersonation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.mockResolvedValue(undefined);
  });

  it('writes an impersonate_end audit row with the real workspaceId', async () => {
    mockGetAdmin.mockResolvedValueOnce({ role: 'super_admin', workspaceId: WORKSPACE_ID });
    const result = await stopImpersonation('super-1', 'tenant-x');
    expect(result.success).toBe(true);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        actorUserId: 'super-1',
        targetTenantId: 'tenant-x',
        acao: 'impersonate_end',
      })
    );
  });

  it('soft-fails (no audit) when the actor is no longer a workspace admin', async () => {
    mockGetAdmin.mockResolvedValueOnce(null);
    const result = await stopImpersonation('super-1', 'tenant-x');
    expect(result.success).toBe(false);
    expect(insertValues).not.toHaveBeenCalled();
  });
});
