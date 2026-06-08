import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TransferirHumanoDeps } from '../transferir-humano.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  lead: { nome: 'Maria', temperatura: 'quente' } as
    | { nome: string | null; temperatura: string }
    | undefined,
  connection: {
    phoneNumberId: 'pn',
    wabaId: 'wb',
    accessTokenEncrypted: 'enc',
    accessTokenIv: 'iv',
  },
  existingAssignment: undefined as { id: string } | undefined,
  inboxInserts: [] as Record<string, unknown>[],
  inboxUpdates: [] as Record<string, unknown>[],
  messageInserts: [] as Record<string, unknown>[],
  journeyInserts: [] as Record<string, unknown>[],
  threadStatusCalls: [] as Array<[string, string, string]>,
}));

function makeTx() {
  let selected = '';
  const b: Record<string, (...a: unknown[]) => unknown> = {};
  b.select = () => b;
  b.from = (table: unknown) => {
    selected = String((table as { _marker?: string })?._marker ?? '');
    return b;
  };
  b.where = () => b;
  b.limit = () => {
    if (selected === 'leads') return state.lead ? [state.lead] : [];
    if (selected === 'whatsappConnections') return [state.connection];
    if (selected === 'inboxAssignments') {
      return state.existingAssignment ? [state.existingAssignment] : [];
    }
    return [];
  };
  // insert(table).values(row).returning() OR insert(table).values(row) -> Promise
  b.insert = (table: unknown) => {
    const marker = String((table as { _marker?: string })?._marker ?? '');
    return {
      values: (row: Record<string, unknown>) => {
        if (marker === 'inboxAssignments') state.inboxInserts.push(row);
        else if (marker === 'messages') state.messageInserts.push(row);
        else if (marker === 'leadJourneyEvents') state.journeyInserts.push(row);
        const result = {
          returning: () => Promise.resolve([{ id: 'new-assignment-id' }]),
        };
        // Allow `await tx.insert(...).values(...)` (no .returning()) too.
        return Object.assign(Promise.resolve(undefined), result);
      },
    };
  };
  b.update = (_table: unknown) => ({
    set: (vals: Record<string, unknown>) => {
      state.inboxUpdates.push(vals);
      return { where: () => Promise.resolve(undefined) };
    },
  });
  return b;
}

vi.mock('@leedi/db', () => {
  const tag = (marker: string) => ({ _marker: marker });
  return {
    withTenant: (_id: string, fn: (tx: unknown) => unknown) => fn(makeTx()),
    schema: {
      leads: { ...tag('leads'), tenantId: {}, id: {}, nome: {}, temperatura: {} },
      whatsappConnections: {
        ...tag('whatsappConnections'),
        tenantId: {},
        id: {},
        phoneNumberId: {},
        wabaId: {},
        accessTokenEncrypted: {},
        accessTokenIv: {},
      },
      inboxAssignments: {
        ...tag('inboxAssignments'),
        id: {},
        conversationWindowId: {},
      },
      messages: tag('messages'),
      leadJourneyEvents: tag('leadJourneyEvents'),
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock('@leedi/connection', () => ({
  MetaCloudProvider: class {
    sendText() {
      return Promise.resolve({ messageId: 'meta-default' });
    }
  },
}));

vi.mock('@leedi/agent-memory', () => ({
  updateThreadStatus: vi.fn((tenantId: string, threadId: string, status: string) => {
    state.threadStatusCalls.push([tenantId, threadId, status]);
    return Promise.resolve();
  }),
}));

const ctx = {
  tenantId: 't1',
  leadId: 'lead-1',
  leadPhone: '+5511999999999',
  connectionId: 'conn-1',
  threadId: 'th-1',
  conversationWindowId: 'win-1',
};

function makeAnthropic(text = '## Sobre o Lead\nMaria quer comprar.') {
  const create = vi.fn(async (_params: { model: string }) => ({
    content: [{ type: 'text', text }],
  }));
  return { create, messages: { create } };
}

/** Casts a makeAnthropic() result to the deps' anthropic type for call sites. */
function asDep(
  a: ReturnType<typeof makeAnthropic>
): NonNullable<TransferirHumanoDeps['anthropic']> {
  return a as unknown as NonNullable<TransferirHumanoDeps['anthropic']>;
}

function makeSender() {
  const sent: Array<{ to: string; body: string }> = [];
  return {
    sent,
    factory: () => ({
      sendText: async (to: string, body: string) => {
        sent.push({ to, body });
        return { messageId: 'meta-123' };
      },
    }),
  };
}

describe('transferirHumano', () => {
  beforeEach(() => {
    state.lead = { nome: 'Maria', temperatura: 'quente' };
    state.existingAssignment = undefined;
    state.inboxInserts = [];
    state.inboxUpdates = [];
    state.messageInserts = [];
    state.journeyInserts = [];
    state.threadStatusCalls = [];
  });

  it('generates the handoff summary via Haiku and upserts the assignment (AC#1, AC#2)', async () => {
    const { transferirHumano } = await import('../transferir-humano.js');
    const anthropic = makeAnthropic('## Sobre o Lead\nMaria quer comprar, objeção: preço.');
    const sender = makeSender();

    const res = await transferirHumano(
      { motivo: 'lead pediu humano', conversationSummary: 'quer comprar mas acha caro' },
      ctx,
      { anthropic: asDep(anthropic), senderFactory: sender.factory }
    );

    // Haiku used (not Sonnet)
    expect(anthropic.create).toHaveBeenCalledTimes(1);
    expect(anthropic.create.mock.calls[0]![0].model).toBe('claude-haiku-4-5-20251001');

    // Upsert as a fresh INSERT with the right status + populated resumo (AC#1, AC#2)
    expect(state.inboxInserts).toHaveLength(1);
    expect(state.inboxInserts[0]).toMatchObject({
      tenantId: 't1',
      conversationWindowId: 'win-1',
      status: 'aguardando_humano',
      motivoHandoff: 'lead pediu humano',
    });
    expect(state.inboxInserts[0]!.resumoHandoff).toContain('Maria quer comprar');

    expect(res).toEqual({ transferred: true, assignmentId: 'new-assignment-id' });
  });

  it('sends the EXACT literal handoff message and persists it as autor=agente (AC#1)', async () => {
    const { transferirHumano } = await import('../transferir-humano.js');
    const sender = makeSender();

    await transferirHumano(
      { motivo: 'm', conversationSummary: 's' },
      ctx,
      { anthropic: asDep(makeAnthropic()), senderFactory: sender.factory }
    );

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toEqual({
      to: '+5511999999999',
      body: 'Vou te conectar com um de nossos especialistas. Um momento!',
    });
    expect(state.messageInserts).toHaveLength(1);
    expect(state.messageInserts[0]).toMatchObject({
      autor: 'agente',
      direction: 'outbound',
      content: 'Vou te conectar com um de nossos especialistas. Um momento!',
      status: 'enviado',
    });
  });

  it('emits the operator notification event { tipo: lead_pediu_humano, leadName, tenantId } (AC#3)', async () => {
    const { transferirHumano } = await import('../transferir-humano.js');
    const sender = makeSender();

    await transferirHumano(
      { motivo: 'm', conversationSummary: 's' },
      ctx,
      { anthropic: asDep(makeAnthropic()), senderFactory: sender.factory }
    );

    expect(state.journeyInserts).toHaveLength(1);
    expect(state.journeyInserts[0]).toMatchObject({
      tenantId: 't1',
      leadId: 'lead-1',
      tipo: 'handoff',
      detalhes: { tipo: 'lead_pediu_humano', leadName: 'Maria', tenantId: 't1' },
    });
  });

  it('pauses the agent thread via updateThreadStatus (never touches agent_threads directly)', async () => {
    const { transferirHumano } = await import('../transferir-humano.js');
    const sender = makeSender();

    await transferirHumano(
      { motivo: 'm', conversationSummary: 's' },
      ctx,
      { anthropic: asDep(makeAnthropic()), senderFactory: sender.factory }
    );

    expect(state.threadStatusCalls).toEqual([['t1', 'th-1', 'pausado']]);
  });

  it('is idempotent on conversation_window_id — updates instead of inserting a duplicate', async () => {
    state.existingAssignment = { id: 'existing-id' };
    const { transferirHumano } = await import('../transferir-humano.js');
    const sender = makeSender();

    const res = await transferirHumano(
      { motivo: 'm2', conversationSummary: 's2' },
      ctx,
      { anthropic: asDep(makeAnthropic()), senderFactory: sender.factory }
    );

    expect(state.inboxInserts).toHaveLength(0);
    expect(state.inboxUpdates).toHaveLength(1);
    expect(state.inboxUpdates[0]).toMatchObject({
      status: 'aguardando_humano',
      motivoHandoff: 'm2',
    });
    expect(res.assignmentId).toBe('existing-id');
  });

  it('falls back to the phone for leadName when the lead has no nome', async () => {
    state.lead = { nome: null, temperatura: 'frio' };
    const { transferirHumano } = await import('../transferir-humano.js');
    const sender = makeSender();

    await transferirHumano(
      { motivo: 'm', conversationSummary: 's' },
      ctx,
      { anthropic: asDep(makeAnthropic()), senderFactory: sender.factory }
    );

    expect(state.journeyInserts[0]!.detalhes).toMatchObject({
      leadName: '+5511999999999',
    });
  });
});
