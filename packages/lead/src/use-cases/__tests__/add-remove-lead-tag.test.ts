import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db for the tag use cases.
 *
 * addLeadTag:    tx.insert(lead_tags).values({...}).returning({...}) -> [row]
 * removeLeadTag: tx.delete(lead_tags).where(and(eq,eq,eq))           -> void
 *
 * We capture the values handed to insert() and the condition handed to where()
 * so we can assert origemTag === 'manual' and the triple (id + lead_id +
 * tenant_id) delete scope.
 */
const insertedValues: unknown[] = [];
const deleteWheres: unknown[] = [];

vi.mock('@leedi/db', () => {
  return {
    withTenant: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (_tenantId: string, fn: (tx: any) => Promise<unknown>) =>
        fn({
          insert: () => {
            const chain: Record<string, unknown> = {};
            chain.values = (v: { tag: string }) => {
              insertedValues.push(v);
              chain.__values = v;
              return chain;
            };
            chain.returning = () =>
              Promise.resolve([
                {
                  id: 'new-tag-id',
                  tag: (chain.__values as { tag: string }).tag,
                  createdAt: new Date('2026-06-01T12:00:00Z'),
                },
              ]);
            return chain;
          },
          delete: () => {
            const chain: Record<string, unknown> = {};
            chain.where = (cond: unknown) => {
              deleteWheres.push(cond);
              return Promise.resolve(undefined);
            };
            return chain;
          },
        })
    ),
    schema: {
      leadTags: {
        id: 'lead_tags.id',
        leadId: 'lead_tags.lead_id',
        tenantId: 'lead_tags.tenant_id',
        tag: 'lead_tags.tag',
        origemTag: 'lead_tags.origem_tag',
        createdAt: 'lead_tags.created_at',
      },
    },
    eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  };
});

describe('addLeadTag', () => {
  beforeEach(() => {
    insertedValues.length = 0;
    deleteWheres.length = 0;
    vi.clearAllMocks();
  });

  it("inserts with origemTag 'manual' scoped to lead + tenant", async () => {
    const { addLeadTag } = await import('../add-lead-tag.js');

    const result = await addLeadTag({ tenantId: 'tenant-1', leadId: 'lead-1', tag: 'vip' });

    expect(insertedValues[0]).toMatchObject({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      tag: 'vip',
      origemTag: 'manual',
    });
    expect(result).toEqual({
      id: 'new-tag-id',
      tag: 'vip',
      origemTag: 'manual',
      createdAt: new Date('2026-06-01T12:00:00Z'),
    });
  });

  it('trims surrounding whitespace from the tag', async () => {
    const { addLeadTag } = await import('../add-lead-tag.js');

    await addLeadTag({ tenantId: 'tenant-1', leadId: 'lead-1', tag: '  promo  ' });

    expect((insertedValues[0] as { tag: string }).tag).toBe('promo');
  });

  it('scopes the write to the tenant via withTenant', async () => {
    const { addLeadTag } = await import('../add-lead-tag.js');
    const { withTenant } = await import('@leedi/db');

    await addLeadTag({ tenantId: 'tenant-xyz', leadId: 'lead-1', tag: 'x' });

    expect(withTenant).toHaveBeenCalledWith('tenant-xyz', expect.any(Function));
  });
});

describe('removeLeadTag', () => {
  beforeEach(() => {
    insertedValues.length = 0;
    deleteWheres.length = 0;
    vi.clearAllMocks();
  });

  it('scopes the delete to tagId + leadId + tenantId (defense in depth)', async () => {
    const { removeLeadTag } = await import('../remove-lead-tag.js');

    await removeLeadTag({ tenantId: 'tenant-1', leadId: 'lead-1', tagId: 'tag-1' });

    // The where condition is and(eq(id, tagId), eq(leadId, ...), eq(tenantId, ...)).
    const cond = deleteWheres[0] as { op: string; args: Array<{ col: string; val: string }> };
    expect(cond.op).toBe('and');

    const byCol = new Map(cond.args.map((a) => [a.col, a.val]));
    expect(byCol.get('lead_tags.id')).toBe('tag-1');
    expect(byCol.get('lead_tags.lead_id')).toBe('lead-1');
    expect(byCol.get('lead_tags.tenant_id')).toBe('tenant-1');
  });

  it('scopes the delete to the tenant via withTenant', async () => {
    const { removeLeadTag } = await import('../remove-lead-tag.js');
    const { withTenant } = await import('@leedi/db');

    await removeLeadTag({ tenantId: 'tenant-abc', leadId: 'lead-1', tagId: 'tag-1' });

    expect(withTenant).toHaveBeenCalledWith('tenant-abc', expect.any(Function));
  });
});
