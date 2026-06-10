import { describe, it, expect, vi, beforeEach } from 'vitest';

let inviteRows: Array<{ email: string; role: string; expiresAt: Date }> = [];
const whereSpy = vi.fn();

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn((...args: unknown[]) => {
        whereSpy(...args);
        return Promise.resolve(inviteRows);
      }),
    };
    return fn(mockTx);
  }),
  schema: {
    invitations: {
      tenantId: 'tenantId',
      email: 'email',
      role: 'role',
      expiresAt: 'expiresAt',
      acceptedAt: 'acceptedAt',
    },
  },
  eq: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  gt: vi.fn((col: unknown, val: unknown) => ({ gt: [col, val] })),
}));

import { listPendingInvitations } from './list-pending-invitations.js';

describe('listPendingInvitations', () => {
  beforeEach(() => {
    inviteRows = [];
    whereSpy.mockClear();
  });

  it('returns pending invitations with email, role and expiry', async () => {
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    inviteRows = [{ email: 'invitee@acme.com', role: 'admin', expiresAt }];

    const pending = await listPendingInvitations('tenant-a');

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ email: 'invitee@acme.com', role: 'admin' });
    // Predicate filters on not-accepted + not-expired (the `and` of both conditions).
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when there are no pending invitations', async () => {
    inviteRows = [];
    const pending = await listPendingInvitations('tenant-a');
    expect(pending).toEqual([]);
  });
});
