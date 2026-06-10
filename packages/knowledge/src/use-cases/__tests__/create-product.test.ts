import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @leedi/db before importing the use case
vi.mock('@leedi/db', () => {
  const returning = vi.fn().mockResolvedValue([
    {
      id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      tenantId: '11111111-1111-4111-8111-111111111111',
      nome: 'Curso X',
      preco: '297.00',
      linkCheckout: 'https://checkout.example.com/x',
      tipo: 'principal',
      argumentos: [],
      diferenciais: [],
      provasSociais: [],
      garantia: null,
      bonus: [],
      gatewayProductId: null,
      ativo: true,
    },
  ]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  const tx = { insert };
  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: {
      products: {
        id: 'products.id',
        tenantId: 'products.tenant_id',
        nome: 'products.nome',
        linkCheckout: 'products.link_checkout',
        ativo: 'products.ativo',
      },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

describe('createProduct', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a product successfully', async () => {
    const { createProduct } = await import('../create-product.js');
    const result = await createProduct({
      tenantId: '11111111-1111-4111-8111-111111111111',
      nome: 'Curso X',
      preco: 297,
      linkCheckout: 'https://checkout.example.com/x',
    });
    expect(result.nome).toBe('Curso X');
    expect(result.ativo).toBe(true);
  });

  it('rejects missing linkCheckout', async () => {
    const { createProduct, ProductValidationError } = await import('../create-product.js');
    await expect(
      createProduct({
        tenantId: '11111111-1111-4111-8111-111111111111',
        nome: 'Curso X',
        preco: 297,
        linkCheckout: 'not-a-url',
      })
    ).rejects.toThrow(ProductValidationError);
  });

  it('rejects non-positive preco', async () => {
    const { createProduct, ProductValidationError } = await import('../create-product.js');
    await expect(
      createProduct({
        tenantId: '11111111-1111-4111-8111-111111111111',
        nome: 'Curso X',
        preco: 0,
        linkCheckout: 'https://checkout.example.com/x',
      })
    ).rejects.toThrow(ProductValidationError);
  });

  it('rejects negative preco', async () => {
    const { createProduct, ProductValidationError } = await import('../create-product.js');
    await expect(
      createProduct({
        tenantId: '11111111-1111-4111-8111-111111111111',
        nome: 'Curso X',
        preco: -10,
        linkCheckout: 'https://checkout.example.com/x',
      })
    ).rejects.toThrow(ProductValidationError);
  });
});
