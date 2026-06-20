import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRows: Array<{ nome: string; materialLancamento: string | null }> = [];

vi.mock('@leedi/db', () => {
  const makeTx = () => ({
    select: () => ({
      from() {
        return { where() { return { limit: () => Promise.resolve(mockRows) }; } };
      },
    }),
  });
  return {
    withTenant: vi.fn((_id: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
    schema: { products: { nome: {}, materialLancamento: {}, id: {}, tenantId: {}, ativo: {} } },
    eq: vi.fn(() => ({})),
    and: vi.fn((...a: unknown[]) => a),
  };
});

beforeEach(() => { mockRows = []; vi.resetModules(); });

describe('consultarMaterialProduto (P0-4b)', () => {
  it('returns the product material when found', async () => {
    mockRows = [{ nome: 'Libras A2 Club', materialLancamento: 'CPL 1: ...' }];
    const { consultarMaterialProduto } = await import('../consultar-material-produto.js');
    const res = await consultarMaterialProduto({ productId: 'p1' }, { tenantId: 't1' });
    expect(res).toEqual({ encontrado: true, nome: 'Libras A2 Club', material: 'CPL 1: ...' });
  });

  it('returns encontrado:false when the product has no material / does not exist', async () => {
    mockRows = [];
    const { consultarMaterialProduto } = await import('../consultar-material-produto.js');
    const res = await consultarMaterialProduto({ productId: 'nope' }, { tenantId: 't1' });
    expect(res).toEqual({ encontrado: false });
  });
});
