import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOffers = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    nome: 'Curso Alpha',
    preco: '497.00',
    precoParcelado: '55.00',
    parcelas: 10,
    linkCheckout: 'https://pay.example.com/alpha',
    tipo: 'principal',
    argumentos: ['Argumento 1'],
    diferenciais: ['Diferencial A'],
    provasSociais: ['1000 alunos'],
    garantia: '30 dias',
    bonus: ['Bônus X'],
    gatewayProductId: 'prod_abc',
  },
];

vi.mock('@leedi/db', () => {
  const where = vi.fn().mockResolvedValue(mockOffers);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  const tx = { select };
  return {
    withTenant: vi.fn((_id: string, fn: (tx: typeof tx) => unknown) => fn(tx)),
    schema: {
      products: {
        id: 'products.id',
        nome: 'products.nome',
        preco: 'products.preco',
        precoParcelado: 'products.preco_parcelado',
        parcelas: 'products.parcelas',
        linkCheckout: 'products.link_checkout',
        tipo: 'products.tipo',
        argumentos: 'products.argumentos',
        diferenciais: 'products.diferenciais',
        provasSociais: 'products.provas_sociais',
        garantia: 'products.garantia',
        bonus: 'products.bonus',
        gatewayProductId: 'products.gateway_product_id',
        tenantId: 'products.tenant_id',
        ativo: 'products.ativo',
      },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

describe('getActiveOffers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active offers with correct shape', async () => {
    const { getActiveOffers } = await import('../get-active-offers.js');
    const offers = await getActiveOffers('11111111-1111-4111-8111-111111111111');
    expect(Array.isArray(offers)).toBe(true);
    const [offer] = offers;
    expect(offer).toHaveProperty('nome');
    expect(offer).toHaveProperty('preco');
    expect(offer).toHaveProperty('linkCheckout');
    expect(offer).toHaveProperty('tipo');
    expect(offer).toHaveProperty('argumentos');
    expect(offer).toHaveProperty('diferenciais');
    expect(offer).toHaveProperty('provasSociais');
    expect(offer).toHaveProperty('garantia');
    expect(offer).toHaveProperty('bonus');
  });

  it('calls withTenant with the correct tenantId', async () => {
    const { getActiveOffers } = await import('../get-active-offers.js');
    const { withTenant } = await import('@leedi/db');
    await getActiveOffers('42424242-4242-4242-8242-424242424242');
    expect(withTenant).toHaveBeenCalledWith('42424242-4242-4242-8242-424242424242', expect.any(Function));
  });
});
