import { describe, it, expect, vi, beforeEach } from 'vitest';

let capturedSet: Record<string, unknown> | null = null;

vi.mock('@leedi/db', () => {
  const makeTx = () => ({
    update: () => ({
      set(values: Record<string, unknown>) {
        capturedSet = values;
        return {
          where() {
            return {
              returning: () =>
                Promise.resolve([{ id: 'p1', tenantId: 't1', materialLancamento: values.materialLancamento ?? null }]),
            };
          },
        };
      },
    }),
  });
  return {
    withTenant: vi.fn((_id: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) => fn(makeTx())),
    schema: { products: {} },
    eq: vi.fn(() => ({})),
    and: vi.fn((...a: unknown[]) => a),
  };
});

beforeEach(() => { capturedSet = null; });

describe('updateProduct — materialLancamento (P0-4a)', () => {
  it('accepts and persists materialLancamento', async () => {
    const { updateProduct } = await import('../update-product.js');
    const row = await updateProduct({
      tenantId: '11111111-1111-4111-8111-111111111111',
      productId: '22222222-2222-4222-8222-222222222222',
      materialLancamento: 'Script CPL 1: ...\nGatilho de escassez: ...',
    });
    expect(capturedSet).toMatchObject({ materialLancamento: 'Script CPL 1: ...\nGatilho de escassez: ...' });
    expect(row?.materialLancamento).toContain('Script CPL 1');
  });

  it('rejects a non-string materialLancamento', async () => {
    const { updateProduct } = await import('../update-product.js');
    await expect(
      updateProduct({
        tenantId: '11111111-1111-4111-8111-111111111111',
        productId: '22222222-2222-4222-8222-222222222222',
        // @ts-expect-error invalid type on purpose
        materialLancamento: 123,
      })
    ).rejects.toThrow();
  });
});
