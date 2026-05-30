import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 1 (withUser): memberships rows. Phase 2 (withTenant): the tenant row for
// a given tenantId. The mocks below let a single test drive both phases.
let membershipRows: Array<{ tenantId: string; role: string }> = [];
let tenantRowsById: Record<string, Array<{ name: string; slug: string; logoUrl: string | null }>> =
  {};

vi.mock('@leedi/db', () => ({
  withUser: vi.fn(async (_userId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(membershipRows),
    };
    return fn(mockTx);
  }),
  withTenant: vi.fn(async (tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const mockTx = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(tenantRowsById[tenantId] ?? []),
    };
    return fn(mockTx);
  }),
  schema: {
    memberships: { tenantId: 'tenantId', userId: 'userId', role: 'role' },
    tenants: { id: 'id', name: 'name', slug: 'slug', logoUrl: 'logoUrl' },
  },
  eq: vi.fn(),
}));

import { listUserTenants } from './list-user-tenants.js';

describe('listUserTenants', () => {
  beforeEach(() => {
    membershipRows = [];
    tenantRowsById = {};
  });

  it('returns tenants for the user with their per-tenant role', async () => {
    membershipRows = [
      { tenantId: 'tenant-a', role: 'owner' },
      { tenantId: 'tenant-b', role: 'viewer' },
    ];
    tenantRowsById = {
      'tenant-a': [{ name: 'Empresa A', slug: 'empresa-a', logoUrl: null }],
      'tenant-b': [{ name: 'Empresa B', slug: 'empresa-b', logoUrl: null }],
    };

    const tenants = await listUserTenants('user-123');

    expect(tenants).toHaveLength(2);
    expect(tenants[0]).toMatchObject({
      tenantId: 'tenant-a',
      name: 'Empresa A',
      slug: 'empresa-a',
      role: 'owner',
    });
    expect(tenants[1]).toMatchObject({ tenantId: 'tenant-b', role: 'viewer' });
  });

  it('returns an empty array when the user has no memberships', async () => {
    membershipRows = [];
    const tenants = await listUserTenants('user-123');
    expect(tenants).toEqual([]);
  });

  it('skips a membership whose tenant row is not visible/missing', async () => {
    membershipRows = [
      { tenantId: 'tenant-a', role: 'owner' },
      { tenantId: 'tenant-gone', role: 'admin' },
    ];
    tenantRowsById = {
      'tenant-a': [{ name: 'Empresa A', slug: 'empresa-a', logoUrl: null }],
      // tenant-gone resolves to no row.
    };

    const tenants = await listUserTenants('user-123');

    expect(tenants).toHaveLength(1);
    expect(tenants[0]?.tenantId).toBe('tenant-a');
  });
});
