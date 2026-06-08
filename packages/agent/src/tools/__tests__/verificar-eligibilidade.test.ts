import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  lead: undefined as Record<string, unknown> | undefined,
  product: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@leedi/db', () => {
  function makeTx() {
    let table = '';
    const b: Record<string, (...a: unknown[]) => unknown> = {};
    b.select = () => b;
    b.from = (t: unknown) => {
      table = String((t as { _marker?: string })?._marker ?? '');
      return b;
    };
    b.where = () => b;
    b.limit = () =>
      table === 'leads'
        ? state.lead
          ? [state.lead]
          : []
        : state.product
          ? [state.product]
          : [];
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: {
      leads: { _marker: 'leads' },
      products: { _marker: 'products' },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

const baseCtx = { tenantId: 't1', leadId: 'lead-1' };

describe('verificarElegibilidade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.lead = undefined;
    state.product = undefined;
  });

  it('returns already_purchased when the lead bought THIS product (AC#2)', async () => {
    state.lead = { comprou: true, produtoCompradoId: 'prod-1' };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade({ productId: 'prod-1' }, baseCtx);
    expect(res).toEqual({ eligible: false, reason: 'already_purchased' });
  });

  it('stays eligible when the lead bought a DIFFERENT product', async () => {
    state.lead = { comprou: true, produtoCompradoId: 'prod-OTHER' };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade({ productId: 'prod-1' }, baseCtx);
    expect(res).toEqual({ eligible: true });
  });

  it('is eligible when no campaign phase is injected (evergreen)', async () => {
    state.lead = { comprou: false, produtoCompradoId: null };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade({ productId: 'prod-1' }, baseCtx);
    expect(res).toEqual({ eligible: true });
  });

  it('returns campaign_closed when the active campaign is encerrada', async () => {
    state.lead = { comprou: false, produtoCompradoId: null };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade(
      { productId: 'prod-1' },
      { ...baseCtx, campaignPhase: 'encerrada' }
    );
    expect(res).toEqual({ eligible: false, reason: 'campaign_closed' });
  });

  it('returns campaign_phase when the product is out of the current phase scope', async () => {
    state.lead = { comprou: false, produtoCompradoId: null };
    state.product = { tipo: 'principal' }; // asking for principal during downsell
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade(
      { productId: 'prod-1' },
      { ...baseCtx, campaignPhase: 'downsell' }
    );
    expect(res).toEqual({ eligible: false, reason: 'campaign_phase' });
  });

  it('is eligible when the product matches the current phase scope', async () => {
    state.lead = { comprou: false, produtoCompradoId: null };
    state.product = { tipo: 'downsell' };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade(
      { productId: 'prod-1' },
      { ...baseCtx, campaignPhase: 'downsell' }
    );
    expect(res).toEqual({ eligible: true });
  });

  it('already_purchased takes priority over campaign phase', async () => {
    state.lead = { comprou: true, produtoCompradoId: 'prod-1' };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade(
      { productId: 'prod-1' },
      { ...baseCtx, campaignPhase: 'encerrada' }
    );
    expect(res).toEqual({ eligible: false, reason: 'already_purchased' });
  });

  // Story 10.3 AC#4: lead who purchased the active campaign's product is ineligible
  it('AC#4 (10.3): returns already_purchased when lead bought the active campaign product', async () => {
    const activeCampaignProductId = 'prod-campaign-active';
    state.lead = { comprou: true, produtoCompradoId: activeCampaignProductId };
    const { verificarElegibilidade } = await import('../verificar-eligibilidade.js');
    const res = await verificarElegibilidade(
      { productId: activeCampaignProductId },
      { ...baseCtx, campaignPhase: 'carrinho_aberto' }
    );
    expect(res).toEqual({ eligible: false, reason: 'already_purchased' });
  });
});
