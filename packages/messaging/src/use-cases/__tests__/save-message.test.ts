import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Mock @leedi/db. saveMessage, inside ONE withTenant callback:
 *   tx.insert(messages).values({...}).returning({ id }) -> insertReturns
 */
let insertReturns: Array<{ id: string }> = [];
const insertedValues: unknown[] = [];

function makeTx() {
  const tx: Record<string, unknown> = {};
  tx.insert = () => {
    const chain: Record<string, unknown> = {};
    chain.values = (v: unknown) => {
      insertedValues.push(v);
      return chain;
    };
    chain.returning = () => Promise.resolve(insertReturns);
    return chain;
  };
  return tx;
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_tenantId: string, fn: (tx: any) => Promise<unknown>) => fn(makeTx())
  ),
  schema: {
    messages: { id: 'messages.id' },
  },
}));

describe('saveMessage', () => {
  beforeEach(() => {
    insertReturns = [{ id: 'msg-1' }];
    insertedValues.length = 0;
    vi.clearAllMocks();
  });

  it('inserts a message with conversationWindowId and leadId linked', async () => {
    const { saveMessage } = await import('../save-message.js');

    await saveMessage({
      tenantId: 'tenant-1',
      conversationWindowId: 'win-1',
      leadId: 'lead-1',
      direction: 'inbound',
      content: 'Olá',
      autor: 'lead',
      tipo: 'texto',
      metaMessageId: 'wamid.1',
      status: 'recebido',
    });

    expect(insertedValues[0]).toMatchObject({
      tenantId: 'tenant-1',
      conversationWindowId: 'win-1',
      leadId: 'lead-1',
      direction: 'inbound',
      content: 'Olá',
      autor: 'lead',
      tipo: 'texto',
      metaMessageId: 'wamid.1',
      status: 'recebido',
      metadata: {},
    });
  });

  it('returns the inserted message id', async () => {
    const { saveMessage } = await import('../save-message.js');

    const id = await saveMessage({
      tenantId: 'tenant-1',
      conversationWindowId: 'win-1',
      leadId: 'lead-1',
      direction: 'outbound',
      content: 'resposta',
      status: 'enviado',
    });

    expect(id).toBe('msg-1');
  });
});
