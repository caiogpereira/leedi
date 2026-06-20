import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = 't1';
const CAMPAIGN_ID = 'c-active';
const PRODUCT_ID = 'p-main';
const DOWNSELL_PRODUCT_ID = 'p-down';

interface MockCampaign {
  id: string;
  tenantId: string;
  nome: string;
  tipo: string;
  fase: string;
  status: string;
  produtoId: string | null;
  config: Record<string, unknown>;
}

let mockCampaigns: MockCampaign[] = [];
let mockProducts: Record<string, unknown>[] = [];

const basePrincipalProduct = {
  id: PRODUCT_ID,
  tenantId: TENANT_ID,
  nome: 'Curso Principal',
  preco: '497.00',
  precoParcelado: '49.70',
  parcelas: 10,
  linkCheckout: 'https://pay/main',
  tipo: 'principal',
  argumentos: ['arg'],
  diferenciais: ['dif'],
  provasSociais: ['prova'],
  garantia: '7 dias',
  bonus: ['bonus'],
  gatewayProductId: 'gw-main',
  ativo: true,
};

const baseDownsellProduct = {
  id: DOWNSELL_PRODUCT_ID,
  tenantId: TENANT_ID,
  nome: 'Mini Curso',
  preco: '97.00',
  precoParcelado: null,
  parcelas: null,
  linkCheckout: 'https://pay/down',
  tipo: 'downsell',
  argumentos: [],
  diferenciais: [],
  provasSociais: [],
  garantia: null,
  bonus: [],
  gatewayProductId: null,
  ativo: true,
};

vi.mock('@leedi/db', () => {
  const makeTx = () => ({
    select: () => ({
      from(table: { __name: string }) {
        const rows = () =>
          table.__name === 'campaigns' ? mockCampaigns
          : table.__name === 'products' ? mockProducts
          : [];
        return {
          where(cond: unknown) {
            void cond;
            const all = rows();
            const p = Promise.resolve(all);
            return Object.assign(p, {
              limit: (_n: number) => Promise.resolve(all.slice(0, _n)),
              orderBy: (..._cols: unknown[]) => Promise.resolve(all),
            });
          },
        };
      },
    }),
  });

  return {
    withTenant: vi.fn((_id: string, fn: (tx: ReturnType<typeof makeTx>) => unknown) =>
      fn(makeTx())
    ),
    schema: {
      campaigns: { __name: 'campaigns' },
      products: { __name: 'products' },
    },
    eq: vi.fn((_a: unknown, _b: unknown) => ({})),
    and: vi.fn((...args: unknown[]) => args),
  };
});

beforeEach(() => {
  mockCampaigns = [];
  mockProducts = [basePrincipalProduct];
  vi.resetModules();
});

describe('consultarOfertasAtivas — Story 10.3', () => {
  it('passive sell: returns ALL active products with campanha null when no campaign', async () => {
    mockCampaigns = [];
    mockProducts = [basePrincipalProduct, baseDownsellProduct];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha).toBeNull();
    expect(res.produtos.map((p) => p.id)).toEqual([PRODUCT_ID, DOWNSELL_PRODUCT_ID]);
    expect(res.produtos[0]?.argumentos).toEqual(['arg']);
  });

  it('passive sell: returns empty produtos when there are no active products', async () => {
    mockCampaigns = [];
    mockProducts = [];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.produtos).toEqual([]);
    expect(res.campanha).toBeNull();
  });

  it('AC#1/#6: carrinho_aberto returns principal product + urgency + instrucao_comercial', async () => {
    mockCampaigns = [{
      id: CAMPAIGN_ID, tenantId: TENANT_ID, nome: 'Lançamento', tipo: 'lancamento',
      fase: 'carrinho_aberto', status: 'ativa', produtoId: PRODUCT_ID,
      config: { carrinho_aberto: { urgencia: 'Últimas vagas!', mensagens_chave: ['Bônus'] } },
    }];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha?.fase).toBe('carrinho_aberto');
    expect(res.campanha?.urgencia).toBe('Últimas vagas!');
    expect(res.campanha?.mensagens_chave).toEqual(['Bônus']);
    expect(res.campanha?.instrucao_comercial).toContain('Carrinho aberto');
    expect(res.produtos[0]?.id).toBe(PRODUCT_ID);
  });

  it('AC#1/#5: downsell phase returns downsell product when config.downsell.produto_id is set', async () => {
    mockCampaigns = [{
      id: CAMPAIGN_ID, tenantId: TENANT_ID, nome: 'Lançamento', tipo: 'lancamento',
      fase: 'downsell', status: 'ativa', produtoId: PRODUCT_ID,
      config: { downsell: { produto_id: DOWNSELL_PRODUCT_ID } },
    }];
    mockProducts = [baseDownsellProduct];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha?.fase).toBe('downsell');
    expect(res.campanha?.instrucao_comercial).toContain('downsell');
    expect(res.produtos[0]?.id).toBe(DOWNSELL_PRODUCT_ID);
  });

  it('AC#7: aquecimento returns principal product + aquecimento instrucao', async () => {
    mockCampaigns = [{
      id: CAMPAIGN_ID, tenantId: TENANT_ID, nome: 'Lançamento', tipo: 'lancamento',
      fase: 'aquecimento', status: 'ativa', produtoId: PRODUCT_ID,
      config: {},
    }];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha?.instrucao_comercial).toContain('aquecimento');
    expect(res.produtos[0]?.id).toBe(PRODUCT_ID);
  });

  it('AC#8: perpetuo returns main product + perpetuo instrucao (no phase urgency)', async () => {
    mockCampaigns = [{
      id: CAMPAIGN_ID, tenantId: TENANT_ID, nome: 'Perpétuo', tipo: 'perpetuo',
      fase: 'carrinho_aberto', status: 'ativa', produtoId: PRODUCT_ID,
      config: {},
    }];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha?.tipo).toBe('perpetuo');
    expect(res.campanha?.instrucao_comercial).toContain('venda contínua');
  });

  it('AC#2: only active campaign is returned (non-active ignored)', async () => {
    mockCampaigns = [{
      id: CAMPAIGN_ID, tenantId: TENANT_ID, nome: 'Ativa', tipo: 'lancamento',
      fase: 'carrinho_aberto', status: 'ativa', produtoId: PRODUCT_ID, config: {},
    }];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID });
    expect(res.campanha?.id).toBe(CAMPAIGN_ID);
    expect(res.produtos).toHaveLength(1);
  });

  it('Playground: explicit campaignId uses that campaign (AC task 3)', async () => {
    const SPECIFIC_CAMPAIGN = 'c-specific';
    mockCampaigns = [{
      id: SPECIFIC_CAMPAIGN, tenantId: TENANT_ID, nome: 'Específica', tipo: 'lancamento',
      fase: 'carrinho_aberto', status: 'rascunho', produtoId: PRODUCT_ID, config: {},
    }];
    const { consultarOfertasAtivas } = await import('../consultar-ofertas-ativas.js');
    const res = await consultarOfertasAtivas({ tenantId: TENANT_ID, campaignId: SPECIFIC_CAMPAIGN });
    expect(res.campanha?.id).toBe(SPECIFIC_CAMPAIGN);
  });
});
