import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  product: undefined as Record<string, unknown> | undefined,
  connection: undefined as Record<string, unknown> | undefined,
  inserted: [] as Record<string, unknown>[],
  sendText: vi.fn(async () => ({ messageId: 'wamid.123' })),
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
      table === 'products'
        ? state.product
          ? [state.product]
          : []
        : state.connection
          ? [state.connection]
          : [];
    b.insert = () => ({
      values: (row: Record<string, unknown>) => {
        state.inserted.push(row);
        return Promise.resolve();
      },
    });
    return b;
  }
  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(makeTx())),
    schema: {
      products: { _marker: 'products' },
      whatsappConnections: { _marker: 'whatsappConnections' },
      messages: { _marker: 'messages' },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock('@leedi/connection', () => ({
  MetaCloudProvider: vi.fn(function (this: { sendText: typeof state.sendText }) {
    this.sendText = state.sendText;
  }),
}));

const ctx = {
  tenantId: 't1',
  leadId: 'lead-1',
  leadPhone: '+5511999999999',
  connectionId: 'c1',
  conversationWindowId: 'w1',
};

describe('enviarLinkCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.product = undefined;
    state.connection = undefined;
    state.inserted = [];
    state.sendText = vi.fn(async () => ({ messageId: 'wamid.123' }));
  });

  it('formats the message EXACTLY and sends via MetaCloudProvider (AC#1)', async () => {
    state.product = { nome: 'Curso X', linkCheckout: 'https://pay.com/x' };
    state.connection = {
      phoneNumberId: 'p1',
      wabaId: 'w',
      accessTokenEncrypted: 'enc',
      accessTokenIv: 'iv',
    };
    const { enviarLinkCheckout } = await import('../enviar-link-checkout.js');
    const { MetaCloudProvider } = await import('@leedi/connection');

    const res = await enviarLinkCheckout({ productId: 'prod-1' }, ctx);

    expect(state.sendText).toHaveBeenCalledWith(
      '+5511999999999',
      'Aqui está o link para Curso X: https://pay.com/x'
    );
    expect(MetaCloudProvider).toHaveBeenCalledWith(state.connection);
    expect(res).toEqual({ sent: true, messageId: 'wamid.123' });
  });

  it("persists the outbound message with autor='agente' (AC#1)", async () => {
    state.product = { nome: 'Curso X', linkCheckout: 'https://pay.com/x' };
    state.connection = {
      phoneNumberId: 'p1',
      wabaId: 'w',
      accessTokenEncrypted: 'enc',
      accessTokenIv: 'iv',
    };
    const { enviarLinkCheckout } = await import('../enviar-link-checkout.js');

    await enviarLinkCheckout({ productId: 'prod-1' }, ctx);

    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      autor: 'agente',
      direction: 'outbound',
      tipo: 'texto',
      status: 'enviado',
      content: 'Aqui está o link para Curso X: https://pay.com/x',
      metaMessageId: 'wamid.123',
      leadId: 'lead-1',
      conversationWindowId: 'w1',
    });
  });

  it('rejects when the product does not exist', async () => {
    state.product = undefined;
    state.connection = {
      phoneNumberId: 'p1',
      wabaId: 'w',
      accessTokenEncrypted: 'enc',
      accessTokenIv: 'iv',
    };
    const { enviarLinkCheckout } = await import('../enviar-link-checkout.js');
    await expect(enviarLinkCheckout({ productId: 'missing' }, ctx)).rejects.toThrow(
      /Product not found/
    );
    expect(state.sendText).not.toHaveBeenCalled();
  });
});
