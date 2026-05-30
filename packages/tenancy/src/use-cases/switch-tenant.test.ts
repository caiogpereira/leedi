import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@leedi/db', () => ({
  withUser: vi.fn(),
  schema: {
    memberships: { userId: 'userId', tenantId: 'tenantId', role: 'role' },
  },
  eq: vi.fn(),
  and: vi.fn(),
}));

import { withUser } from '@leedi/db';
import { switchTenant } from './switch-tenant.js';

const mockWithUser = vi.mocked(withUser);

function membershipTx(rows: Array<{ role: string }>) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

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

  it('returns success when an active membership exists', async () => {
    mockWithUser.mockImplementationOnce(
      async (_uid, fn) => fn(membershipTx([{ role: 'admin' }]) as never)
    );

    const result = await switchTenant('user-1', 'tenant-a');

    expect(result.success).toBe(true);
  });
});
