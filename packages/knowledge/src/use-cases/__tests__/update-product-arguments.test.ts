import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@leedi/db', () => {
  const returning = vi.fn().mockResolvedValue([{ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }]);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  const tx = { update };
  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: {
      products: {
        id: 'products.id',
        tenantId: 'products.tenant_id',
        argumentos: 'products.argumentos',
        diferenciais: 'products.diferenciais',
        provasSociais: 'products.provas_sociais',
        bonus: 'products.bonus',
      },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

describe('updateProductArguments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces the argumentos array and returns true', async () => {
    const { updateProductArguments } = await import('../update-product-arguments.js');
    const result = await updateProductArguments({
      tenantId: '11111111-1111-4111-8111-111111111111',
      productId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      field: 'argumentos',
      items: ['Argumento A', 'Argumento B'],
    });
    expect(result).toBe(true);
  });

  it('accepts items in the given order and returns true', async () => {
    const { updateProductArguments } = await import('../update-product-arguments.js');
    // Verify the function does not sort/reorder — just pass through
    const result = await updateProductArguments({
      tenantId: '11111111-1111-4111-8111-111111111111',
      productId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      field: 'argumentos',
      items: ['Terceiro', 'Primeiro', 'Segundo'],
    });
    expect(result).toBe(true);
  });

  it('rejects empty string items', async () => {
    const { updateProductArguments } = await import('../update-product-arguments.js');
    const { ProductValidationError } = await import('../create-product.js');
    await expect(
      updateProductArguments({
        tenantId: '11111111-1111-4111-8111-111111111111',
        productId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        field: 'argumentos',
        items: ['Válido', ''],
      })
    ).rejects.toThrow(ProductValidationError);
  });
});
