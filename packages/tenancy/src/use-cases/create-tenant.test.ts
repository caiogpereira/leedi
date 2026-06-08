import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controls the slug-uniqueness lookup result.
let slugRows: Array<{ id: string }> = [];
const insertValues = vi.fn();
const returningSpy = vi.fn();

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(slugRows) })),
        })),
      })),
      insert: vi.fn(() => ({
        values: insertValues.mockReturnValue({ returning: returningSpy }),
      })),
    })
  ),
  schema: { tenants: { id: 'id', slug: 'slug' } },
  eq: vi.fn(),
}));

const inviteMember = vi.fn();
vi.mock('./invite-member.js', () => ({
  inviteMember: (...args: unknown[]) => inviteMember(...args),
}));

import { createTenant } from './create-tenant.js';

const base = {
  name: 'Acme Inc',
  ownerEmail: 'owner@acme.com',
  plano: 'pro' as const,
  workspaceId: '22222222-2222-4222-8222-222222222222',
  invitedByUserId: '33333333-3333-4333-8333-333333333333',
};

describe('createTenant', () => {
  beforeEach(() => {
    slugRows = [];
    insertValues.mockClear();
    returningSpy.mockReset();
    returningSpy.mockResolvedValue([{ id: 'tenant-1', slug: 'acme-inc' }]);
    inviteMember.mockReset();
    inviteMember.mockResolvedValue({ success: true });
  });

  it('inserts the tenant as trial and invites the owner via the Epic 2.6 flow', async () => {
    const result = await createTenant(base);

    expect(result).toEqual({ success: true, tenantId: 'tenant-1', slug: 'acme-inc' });
    expect(insertValues).toHaveBeenCalledTimes(1);
    const inserted = insertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted.status).toBe('trial');
    expect(inserted.plan).toBe('pro');
    expect(inserted.slug).toBe('acme-inc');
    expect(inserted.workspaceId).toBe(base.workspaceId);

    expect(inviteMember).toHaveBeenCalledWith({
      email: 'owner@acme.com',
      role: 'owner',
      tenantId: 'tenant-1',
      invitedByUserId: base.invitedByUserId,
      inviterRole: 'owner',
    });
  });

  it('appends a random suffix when the base slug already exists', async () => {
    slugRows = [{ id: 'collision' }];
    await createTenant(base);
    const inserted = insertValues.mock.calls[0]?.[0] as { slug: string };
    expect(inserted.slug).toMatch(/^acme-inc-[0-9a-f]{6}$/);
  });

  it('returns the invite failure (tenant already created) so the admin can resend', async () => {
    inviteMember.mockResolvedValue({ success: false, error: 'E-mail inválido' });
    const result = await createTenant(base);
    expect(result).toEqual({ success: false, error: 'E-mail inválido' });
  });
});
