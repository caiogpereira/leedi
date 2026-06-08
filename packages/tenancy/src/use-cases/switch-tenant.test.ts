import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@leedi/db', () => ({
  withUser: vi.fn(),
  withServiceRole: vi.fn(),
  schema: {
    memberships: { userId: 'userId', tenantId: 'tenantId', role: 'role' },
    tenants: { id: 'id', status: 'status' },
  },
  eq: vi.fn(),
  and: vi.fn(),
}));

import { withUser, withServiceRole } from '@leedi/db';
import { switchTenant } from './switch-tenant.js';

const mockWithUser = vi.mocked(withUser);
const mockWithServiceRole = vi.mocked(withServiceRole);

function rowsTx(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

const membershipTx = rowsTx;

describe('switchTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an error when the user is not a member of the target tenant', async () => {
    mockWithUser.mockImplementationOnce(
      async (_uid, fn) => fn(membershipTx([]) as never)
    );

    const result = await switchTenant('user-1', 'tenant-x');

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe('Acesso negado a este tenant');
  });

  it('returns success when an active membership exists and the tenant is active', async () => {
    mockWithUser.mockImplementationOnce(
      async (_uid, fn) => fn(membershipTx([{ role: 'admin' }]) as never)
    );
    // Lifecycle gate: the target tenant must be active/trial to switch into.
    mockWithServiceRole.mockImplementationOnce(
      async (fn) => fn(rowsTx([{ status: 'active' }]) as never)
    );

    const result = await switchTenant('user-1', 'tenant-a');

    expect(result.success).toBe(true);
  });

  it('rejects switching into a blocked tenant even for a valid member', async () => {
    mockWithUser.mockImplementationOnce(
      async (_uid, fn) => fn(membershipTx([{ role: 'owner' }]) as never)
    );
    mockWithServiceRole.mockImplementationOnce(
      async (fn) => fn(rowsTx([{ status: 'blocked' }]) as never)
    );

    const result = await switchTenant('user-1', 'tenant-a');

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toBe('Esta empresa está suspensa ou cancelada');
  });
});
