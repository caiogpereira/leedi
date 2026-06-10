import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 6.3 AC#6 — delete is a SOFT delete (ativo = false), never a hard delete.
const { returningMock, setSpy } = vi.hoisted(() => ({
  returningMock: vi.fn(),
  setSpy: vi.fn(),
}));

vi.mock('@leedi/db', () => {
  const where = vi.fn().mockReturnValue({ returning: returningMock });
  const set = vi.fn((arg: unknown) => {
    setSpy(arg);
    return { where };
  });
  const update = vi.fn().mockReturnValue({ set });
  const tx = { update };
  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: {
      knowledgeBase: {
        id: 'kb.id',
        tenantId: 'kb.tenant_id',
      },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

describe('deleteKnowledgeEntry (soft delete)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets ativo = false (never hard-deletes) and returns true', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }]);
    const { deleteKnowledgeEntry } = await import('../delete-knowledge-entry.js');
    const result = await deleteKnowledgeEntry(
      '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );
    expect(result).toBe(true);
    expect(setSpy).toHaveBeenCalledWith({ ativo: false });
  });

  it('returns false when no row matches the tenant + id', async () => {
    returningMock.mockResolvedValueOnce([]);
    const { deleteKnowledgeEntry } = await import('../delete-knowledge-entry.js');
    const result = await deleteKnowledgeEntry(
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
    expect(result).toBe(false);
  });
});
