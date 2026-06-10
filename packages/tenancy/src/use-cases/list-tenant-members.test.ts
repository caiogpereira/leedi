import { describe, it, expect, vi, beforeEach } from 'vitest';

let memberRows: Array<{ userId: string; email: string; name: string | null; role: string }> = [];

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(memberRows),
    };
    return fn(mockTx);
  }),
  schema: {
    memberships: { tenantId: 'tenantId', userId: 'userId', role: 'role' },
    users: { id: 'id', email: 'email', name: 'name' },
  },
  eq: vi.fn(),
}));

import { listTenantMembers } from './list-tenant-members.js';

describe('listTenantMembers', () => {
  beforeEach(() => {
    memberRows = [];
  });

  it('returns members with email and per-tenant role', async () => {
    memberRows = [
      { userId: 'u1', email: 'owner@acme.com', name: 'Owner', role: 'owner' },
      { userId: 'u2', email: 'op@acme.com', name: null, role: 'operator' },
    ];

    const members = await listTenantMembers('tenant-a');

    expect(members).toHaveLength(2);
    expect(members[0]).toMatchObject({ email: 'owner@acme.com', role: 'owner' });
    expect(members[1]).toMatchObject({ email: 'op@acme.com', name: null, role: 'operator' });
  });

  it('returns an empty array when the tenant has no members', async () => {
    memberRows = [];
    const members = await listTenantMembers('tenant-a');
    expect(members).toEqual([]);
  });
});
