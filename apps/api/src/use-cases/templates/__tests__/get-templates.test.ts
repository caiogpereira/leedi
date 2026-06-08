import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

const TEMPLATE_A = {
  id: 'tpl-a',
  tenantId: TENANT_A,
  nome: 'template_tenant_a',
  status: 'rascunho',
};

const TEMPLATE_B = {
  id: 'tpl-b',
  tenantId: TENANT_B,
  nome: 'template_tenant_b',
  status: 'aprovado',
};

vi.mock('@leedi/db', () => {
  const ALL_TEMPLATES = [TEMPLATE_A, TEMPLATE_B];

  const withTenant = vi.fn((tenantId: string, fn: (tx: unknown) => unknown) => {
    return fn({
      select: () => ({
        from: () => ({
          where: (_cond: unknown, _ord?: unknown) => ({
            orderBy: () =>
              Promise.resolve(ALL_TEMPLATES.filter((t) => t.tenantId === tenantId)),
          }),
          orderBy: () =>
            Promise.resolve(ALL_TEMPLATES.filter((t) => t.tenantId === tenantId)),
        }),
      }),
    });
  });

  return {
    withTenant,
    schema: { templates: { tenantId: {}, status: {}, createdAt: {} } },
    eq: vi.fn((field, val) => ({ field, val })),
    and: vi.fn((...args) => args),
  };
});

beforeEach(() => vi.clearAllMocks());

describe('getTemplates — RLS-style tenant isolation', () => {
  it('returns only templates belonging to the requested tenant', async () => {
    const { getTemplates } = await import('../get-templates.js');

    const resultsA = await getTemplates(TENANT_A);
    expect(resultsA).toHaveLength(1);
    expect(resultsA[0]?.tenantId).toBe(TENANT_A);

    const resultsB = await getTemplates(TENANT_B);
    expect(resultsB).toHaveLength(1);
    expect(resultsB[0]?.tenantId).toBe(TENANT_B);
  });
});
