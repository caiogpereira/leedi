import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks for the isolated dependencies (memory / db / connection) ───────────

const mem = vi.hoisted(() => ({
  saveThread: vi.fn(),
  saveMessage: vi.fn(),
  getThreadHistory: vi.fn(),
  saveToolCall: vi.fn(),
}));

vi.mock('@leedi/agent-memory', () => ({
  saveThread: mem.saveThread,
  saveMessage: mem.saveMessage,
  getThreadHistory: mem.getThreadHistory,
  saveToolCall: mem.saveToolCall,
}));

// withTenant just runs the callback with a fake tx whose query-builder methods
// return canned context rows. We capture which "table" was selected via a marker.
const dbState = vi.hoisted(() => ({
  agentConfig: {
    nomeAgente: 'Léo',
    persona: 'p',
    estiloMensagem: { tamanho: 'medio', formalidade: 'informal', emoji: true },
    limites: '',
    modeloIa: 'sonnet',
    toolsHabilitadas: {
      consultar_base_conhecimento: false,
      agendar_followup: false,
      transferir_humano: false,
      adicionar_tag: false,
      solicitar_reengajamento: false,
    },
    ativo: true,
    salesMethodId: null,
  } as Record<string, unknown> | undefined,
  lead: { status: 'ativo', comprou: false },
  tenantStatus: 'active',
  connection: {
    phoneNumberId: 'pn',
    wabaId: 'wb',
    accessTokenEncrypted: 'enc',
    accessTokenIv: 'iv',
  },
  // Story 7.6 (AC#4): inbox status for the conversation window. null = no
  // assignment (the default bot path); set to a paused status to skip the agent.
  inboxStatus: null as string | null,
  insertedMessages: [] as unknown[],
  // Story 7.7: capture UPDATE ... SET ... payloads (transcricao / midia_url).
  updates: [] as Array<Record<string, unknown>>,
}));

function makeFakeTx() {
  // A tiny chainable query builder. select().from(table) decides what rows come back.
  let selectedTable = '';
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  const chain = () => builder;
  builder.select = () => builder;
  builder.from = (table: unknown) => {
    selectedTable = String((table as { _marker?: string })?._marker ?? '');
    return builder;
  };
  builder.where = chain;
  builder.orderBy = chain;
  builder.limit = () => resolveRows(selectedTable);
  // insert path
  builder.insert = () => builder;
  builder.values = (vals: unknown) => {
    dbState.insertedMessages.push(vals);
    return builder;
  };
  builder.returning = () => [{ id: 'inserted-id' }];
  // update path (Story 7.7): update().set(vals).where(...)
  builder.update = () => builder;
  builder.set = (vals: unknown) => {
    dbState.updates.push(vals as Record<string, unknown>);
    return builder;
  };
  return builder;
}

function resolveRows(table: string): unknown[] {
  switch (table) {
    case 'agentConfigs':
      return dbState.agentConfig ? [dbState.agentConfig] : [];
    case 'leads':
      return [dbState.lead];
    case 'whatsappConnections':
      return [dbState.connection];
    case 'salesMethods':
      return [];
    case 'products':
      return [];
    case 'inboxAssignments':
      return dbState.inboxStatus === null ? [] : [{ status: dbState.inboxStatus }];
    case 'tenants':
      return [{ status: dbState.tenantStatus }];
    default:
      return [];
  }
}

vi.mock('@leedi/db', () => {
  const tag = (marker: string) => ({ _marker: marker });
  return {
    withTenant: async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(makeFakeTx()),
    schema: {
      agentConfigs: { ...tag('agentConfigs'), tenantId: {} },
      leads: { ...tag('leads'), tenantId: {}, id: {}, status: {}, comprou: {} },
      whatsappConnections: {
        ...tag('whatsappConnections'),
        tenantId: {},
        phoneNumberId: {},
        wabaId: {},
        accessTokenEncrypted: {},
        accessTokenIv: {},
      },
      salesMethods: { ...tag('salesMethods'), id: {}, titulo: {}, descricao: {}, systemPromptTemplate: {}, phases: {} },
      products: {
        ...tag('products'),
        tenantId: {},
        ativo: {},
        tipo: {},
        nome: {},
        descricao: {},
        preco: {},
        linkCheckout: {},
        createdAt: {},
      },
      messages: { ...tag('messages'), id: {}, transcricao: {}, midiaUrl: {} },
      inboxAssignments: { ...tag('inboxAssignments'), conversationWindowId: {}, status: {} },
      tenants: { ...tag('tenants'), id: {}, status: {} },
    },
    eq: () => ({}),
    and: () => ({}),
    sql: (s: unknown) => s,
  };
});

vi.mock('@leedi/connection', () => ({
  MetaCloudProvider: class {
    sendText() {
      return Promise.resolve({ messageId: 'meta-default' });
    }
  },
}));

// Story 7.7: the default `transcribe` param statically imports transcribe-audio,
// which imports the adapters → @leedi/config (env-validating, can process.exit).
// Mock both so the agent unit test never loads real config. Tests inject their
// own `transcribe`/`mediaProviderFactory` deps, so these mocks are just guards.
vi.mock('../../utils/transcribe-audio.js', () => ({
  transcribeAudio: vi.fn(async () => 'mocked transcription'),
  getTranscriptionProvider: vi.fn(),
}));
vi.mock('@leedi/config', () => ({ env: { TRANSCRIPTION_PROVIDER: 'groq' } }));

// Import AFTER mocks are registered.
import {
  processMessage,
  type ProcessMessageDeps,
  type ProcessMessageInput,
} from '../process-message.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRedis(initialHeld = false) {
  const store = new Map<string, string>();
  if (initialHeld) store.set('agent_lock:t1:+5511999999999', 'other-owner');
  return {
    store,
    set: vi.fn(async (key: string, value: string, opts: { nx: true; px: number }) => {
      void opts;
      if (store.has(key)) return null; // NX fails when held
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
  };
}

function assistantTextResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

const baseInput = {
  tenantId: 't1',
  connectionId: 'c1',
  leadId: 'l1',
  leadPhone: '+5511999999999',
  conversationWindowId: 'w1',
  userText: 'Quero saber mais',
};

beforeEach(() => {
  vi.clearAllMocks();
  dbState.insertedMessages = [];
  dbState.updates = [];
  dbState.agentConfig = {
    nomeAgente: 'Léo',
    persona: 'p',
    estiloMensagem: { tamanho: 'medio', formalidade: 'informal', emoji: true },
    limites: '',
    modeloIa: 'sonnet',
    toolsHabilitadas: {
      consultar_base_conhecimento: false,
      agendar_followup: false,
      transferir_humano: false,
      adicionar_tag: false,
      solicitar_reengajamento: false,
    },
    ativo: true,
    salesMethodId: null,
  };
  dbState.lead = { status: 'ativo', comprou: false };
  dbState.inboxStatus = null;
  mem.saveThread.mockResolvedValue({ id: 'th1', tenantId: 't1', leadId: 'l1', conversationWindowId: 'w1', status: 'ativo' });
  mem.saveMessage.mockResolvedValue('m1');
  mem.getThreadHistory.mockResolvedValue([{ role: 'user', content: 'Quero saber mais' }]);
  mem.saveToolCall.mockResolvedValue('tc1');
});

describe('processMessage — happy path', () => {
  it('runs the loop, persists via agent-memory, splits, and sends', async () => {
    const sent: Array<{ to: string; body: string }> = [];
    const deps: ProcessMessageDeps = {
      redis: makeRedis(),
      anthropic: {
        messages: { create: vi.fn(async () => assistantTextResponse('Olá! Tudo certo?')) },
      } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({
        sendText: async (to: string, body: string) => {
          sent.push({ to, body });
          return { messageId: `meta-${sent.length}` };
        },
      }),
      sleep: async () => {},
    };

    const result = await processMessage(baseInput, deps);

    expect(result.status).toBe('sent');
    expect(mem.saveThread).toHaveBeenCalledTimes(1);
    // system + user + assistant persisted
    expect(mem.saveMessage).toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('+5511999999999');
    // outbound message persisted with autor='agente'
    const outbound = dbState.insertedMessages.find(
      (m) => (m as { autor?: string }).autor === 'agente'
    ) as { autor: string; direction: string } | undefined;
    expect(outbound?.autor).toBe('agente');
    expect(outbound?.direction).toBe('outbound');
  });
});

describe('processMessage — model selection (Story 7.8, AC#4/#5)', () => {
  function runWith(modeloIa: 'sonnet' | 'haiku' | 'opus') {
    dbState.agentConfig = { ...dbState.agentConfig!, modeloIa };
    const create = vi.fn(async (_args: { model: string }) => assistantTextResponse('ok'));
    const deps: ProcessMessageDeps = {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    };
    return { create, run: () => processMessage(baseInput, deps) };
  }

  it("uses claude-sonnet-4-6 when modelo_ia='sonnet' (AC#4)", async () => {
    const { create, run } = runWith('sonnet');
    await run();
    expect(create.mock.calls[0]![0].model).toBe('claude-sonnet-4-6');
  });

  it("uses the canonical Haiku id when modelo_ia='haiku'", async () => {
    const { create, run } = runWith('haiku');
    await run();
    expect(create.mock.calls[0]![0].model).toBe('claude-haiku-4-5-20251001');
  });

  it("falls back to Sonnet when modelo_ia='opus' for a non-Enterprise tenant (AC#5)", async () => {
    const { create, run } = runWith('opus');
    await run();
    // The Enterprise plan check is a stub returning false → opus downgrades to sonnet.
    expect(create.mock.calls[0]![0].model).toBe('claude-sonnet-4-6');
  });
});

describe('processMessage — tool loop', () => {
  it('re-calls on stop_reason tool_use, then exits on end_turn', async () => {
    const create = vi
      .fn()
      // first: a tool_use turn
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu1', name: 'buscar_historico_lead', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 8, output_tokens: 4 },
      })
      // second: final answer
      .mockResolvedValueOnce(assistantTextResponse('Encontrei seu histórico, posso ajudar!'));

    const deps: ProcessMessageDeps = {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    };

    const result = await processMessage(baseInput, deps);

    expect(create).toHaveBeenCalledTimes(2);
    expect(mem.saveToolCall).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('sent');
  });
});

describe('processMessage — distributed lock (AC#3)', () => {
  it('drops the second concurrent call when the lock is held', async () => {
    const redis = makeRedis(true); // lock already held by another owner
    const create = vi.fn(async () => assistantTextResponse('hi'));
    const deps: ProcessMessageDeps = {
      redis,
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {}, // skip the retry backoff
    };

    const result = await processMessage(baseInput, deps);

    expect(result.status).toBe('locked');
    // Never reached the model since it couldn't acquire the lock.
    expect(create).not.toHaveBeenCalled();
    // Retried exactly once (two set attempts).
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('does not delete a lock it does not own', async () => {
    const redis = makeRedis(true);
    const deps: ProcessMessageDeps = {
      redis,
      anthropic: { messages: { create: vi.fn() } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    };

    await processMessage(baseInput, deps);
    // The other owner's lock is still in the store.
    expect(redis.store.get('agent_lock:t1:+5511999999999')).toBe('other-owner');
  });
});

describe('processMessage — should_abort', () => {
  it('aborts when the agent is inactive', async () => {
    dbState.agentConfig = { ...(dbState.agentConfig as object), ativo: false } as Record<string, unknown>;
    const create = vi.fn();
    const result = await processMessage(baseInput, {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    });
    expect(result).toEqual({ status: 'aborted', reason: 'agent_inactive' });
    expect(create).not.toHaveBeenCalled();
  });

  it('aborts with tenant_blocked when tenant.status is blocked (Story 17.2, AC#4/#5)', async () => {
    dbState.tenantStatus = 'blocked';
    const create = vi.fn();
    const result = await processMessage(baseInput, {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    });
    expect(result).toEqual({ status: 'aborted', reason: 'tenant_blocked' });
    expect(create).not.toHaveBeenCalled();
    dbState.tenantStatus = 'active';
  });

  it('aborts when the lead has opted out', async () => {
    dbState.lead = { status: 'optout', comprou: false };
    const result = await processMessage(baseInput, {
      redis: makeRedis(),
      anthropic: { messages: { create: vi.fn() } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    });
    expect(result).toEqual({ status: 'aborted', reason: 'lead_optout' });
  });

  // Story 7.6 (AC#4): when a human has taken over (inbox paused), the agent must
  // SKIP processing — no Claude call. The inbound message was already persisted to
  // `messages` (autor='lead') by the webhook before the agent loop runs, so the
  // pause path does NOT re-insert it; it just returns early.
  it.each(['aguardando_humano', 'em_atendimento'])(
    'skips the agent (no Claude call) when inbox status is %s (AC#4)',
    async (inboxStatus) => {
      dbState.inboxStatus = inboxStatus;
      const create = vi.fn();
      const result = await processMessage(baseInput, {
        redis: makeRedis(),
        anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
        senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
        sleep: async () => {},
      });
      expect(result).toEqual({ status: 'aborted', reason: 'inbox_paused' });
      expect(create).not.toHaveBeenCalled();
    }
  );

  it('does NOT skip when inbox status is bot (normal agent path runs)', async () => {
    dbState.inboxStatus = 'bot';
    const create = vi.fn(async () => assistantTextResponse('Olá!'));
    const result = await processMessage(baseInput, {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    });
    expect(result.status).toBe('sent');
    expect(create).toHaveBeenCalled();
  });
});

// ─── Story 7.7: Multimodal input (audio + image) ──────────────────────────────

function makeMediaProvider() {
  return {
    getMediaUrl: vi.fn(async () => ({ url: 'https://cdn.meta/m', mimeType: 'audio/ogg' })),
    downloadMedia: vi.fn(async () => ({
      buffer: Buffer.from('fake-bytes'),
      mimeType: 'audio/ogg',
    })),
  };
}

const audioInput: ProcessMessageInput = {
  ...baseInput,
  userText: '[audio]',
  tipo: 'audio',
  mediaId: 'media-123',
  mimeType: 'audio/ogg',
  inboundMessageId: 'inbound-1',
};

describe('processMessage — audio (Story 7.7)', () => {
  it('transcribes, feeds the transcription to Claude, and UPDATEs messages.transcricao (AC#1)', async () => {
    const media = makeMediaProvider();
    const transcribe = vi.fn(
      async (_buf: Buffer, _mime: string) => 'Quero saber o preço do produto'
    );
    const create = vi.fn(async () => assistantTextResponse('Claro! O preço é...'));

    const result = await processMessage(audioInput, {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      mediaProviderFactory: () => media,
      transcribe,
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    });

    expect(result.status).toBe('sent');
    // Media was resolved + downloaded, then transcribed with the buffer + MIME.
    expect(media.getMediaUrl).toHaveBeenCalledWith('media-123');
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(transcribe.mock.calls[0]![1]).toBe('audio/ogg');
    // The transcription (not '[audio]') is persisted as the user turn.
    expect(mem.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', content: 'Quero saber o preço do produto' })
    );
    // AC#1: transcription stored on the inbound row via UPDATE ... SET transcricao.
    expect(
      dbState.updates.some((u) => u.transcricao === 'Quero saber o preço do produto')
    ).toBe(true);
    // Claude WAS called (normal agent run after transcription).
    expect(create).toHaveBeenCalled();
  });

  it('sends the EXACT fallback and returns early when transcription fails (AC#3)', async () => {
    const media = makeMediaProvider();
    const transcribe = vi.fn(async () => {
      throw new Error('network down');
    });
    const create = vi.fn();
    const logError = vi.fn((_error: unknown, _ctx: Record<string, unknown>) => {});
    const sent: Array<{ to: string; body: string }> = [];

    const result = await processMessage(audioInput, {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      mediaProviderFactory: () => media,
      transcribe,
      logError,
      senderFactory: () => ({
        sendText: async (to: string, body: string) => {
          sent.push({ to, body });
          return { messageId: 'fb-1' };
        },
      }),
      sleep: async () => {},
    });

    // AC#3: the agent never calls Claude on a transcription failure.
    expect(create).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'sent',
      segments: ['Recebi seu áudio mas não consegui entender. Pode me mandar como texto?'],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toBe(
      'Recebi seu áudio mas não consegui entender. Pode me mandar como texto?'
    );
    // Failure logged with context.
    expect(logError).toHaveBeenCalled();
    expect(logError.mock.calls[0]![1]).toMatchObject({
      tenantId: 't1',
      leadId: 'l1',
      messageId: 'inbound-1',
    });
    // Fallback persisted as an outbound agent message.
    const outbound = dbState.insertedMessages.find(
      (m) => (m as { autor?: string }).autor === 'agente'
    ) as { content?: string } | undefined;
    expect(outbound?.content).toBe(
      'Recebi seu áudio mas não consegui entender. Pode me mandar como texto?'
    );
  });
});

describe('processMessage — image (Story 7.7)', () => {
  it('builds a base64 vision block + text and passes it to Claude (AC#4)', async () => {
    const media = {
      getMediaUrl: vi.fn(async () => ({ url: 'https://cdn.meta/img', mimeType: 'image/jpeg' })),
      downloadMedia: vi.fn(async () => ({
        buffer: Buffer.from('img-bytes'),
        mimeType: 'image/jpeg',
      })),
    };
    const create = vi.fn(async (_args: { messages: unknown[] }) =>
      assistantTextResponse('Vi sua foto, parece ótimo!')
    );
    // History returns the caption as the last user turn (as get-thread-history would).
    mem.getThreadHistory.mockResolvedValueOnce([{ role: 'user', content: 'Olha esse produto' }]);

    const imageInput: ProcessMessageInput = {
      ...baseInput,
      userText: 'Olha esse produto',
      tipo: 'imagem',
      mediaId: 'img-123',
      mimeType: 'image/jpeg',
      inboundMessageId: 'inbound-2',
    };

    const result = await processMessage(imageInput, {
      redis: makeRedis(),
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      mediaProviderFactory: () => media,
      senderFactory: () => ({ sendText: async () => ({ messageId: 'x' }) }),
      sleep: async () => {},
    });

    expect(result.status).toBe('sent');
    // AC#4: the multimodal block actually reached the Claude call.
    const callArgs = create.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const lastUser = [...callArgs.messages].reverse().find((m) => m.role === 'user');
    expect(Array.isArray(lastUser!.content)).toBe(true);
    const blocks = lastUser!.content as Array<Record<string, unknown>>;
    const imgBlock = blocks.find((b) => b.type === 'image') as
      | { source: { type: string; media_type: string; data: string } }
      | undefined;
    expect(imgBlock).toBeDefined();
    expect(imgBlock!.source.type).toBe('base64');
    expect(imgBlock!.source.media_type).toBe('image/jpeg');
    expect(imgBlock!.source.data).toBe(Buffer.from('img-bytes').toString('base64'));
    const textBlock = blocks.find((b) => b.type === 'text') as { text: string } | undefined;
    expect(textBlock!.text).toBe('Olha esse produto');
    // AC#5: midia_url stored on the inbound row.
    expect(dbState.updates.some((u) => u.midiaUrl === 'https://cdn.meta/img')).toBe(true);
  });
});

// ─── Story 8.1: Sandbox mode ──────────────────────────────────────────────────

describe('processMessage — sandbox mode (Story 8.1)', () => {
  function makeSandboxDeps(createFn?: ReturnType<typeof vi.fn>) {
    const create =
      createFn ?? vi.fn(async () => assistantTextResponse('Olá! Como posso ajudar?'));
    const sendText = vi.fn(async () => ({ messageId: 'meta-x' }));
    const deps: ProcessMessageDeps = {
      redis: {
        set: vi.fn(async () => 'OK'),
        get: vi.fn(async () => null),
        del: vi.fn(async () => 1),
      },
      anthropic: { messages: { create } } as unknown as ProcessMessageDeps['anthropic'],
      senderFactory: () => ({ sendText }),
      sleep: async () => {},
    };
    return { deps, sendText, create };
  }

  const sandboxInput: ProcessMessageInput = {
    ...baseInput,
    sandboxMode: true,
  };

  it('returns { status: sandbox } with segments and toolCalls', async () => {
    const { deps } = makeSandboxDeps();
    const result = await processMessage(sandboxInput, deps);
    expect(result.status).toBe('sandbox');
    if (result.status === 'sandbox') {
      expect(Array.isArray(result.segments)).toBe(true);
      expect(result.segments.length).toBeGreaterThan(0);
      expect(Array.isArray(result.toolCalls)).toBe(true);
    }
  });

  it('does NOT call MetaCloudProvider.sendText (AC#2)', async () => {
    const { deps, sendText } = makeSandboxDeps();
    await processMessage(sandboxInput, deps);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('does NOT call saveThread, saveMessage, or saveToolCall (Redis-only)', async () => {
    const { deps } = makeSandboxDeps();
    await processMessage(sandboxInput, deps);
    expect(mem.saveThread).not.toHaveBeenCalled();
    expect(mem.saveMessage).not.toHaveBeenCalled();
    expect(mem.saveToolCall).not.toHaveBeenCalled();
  });

  it('does NOT acquire the Redis lock (AC#2 — rapid playground sends)', async () => {
    const { deps } = makeSandboxDeps();
    await processMessage(sandboxInput, deps);
    expect(deps.redis.set).not.toHaveBeenCalled();
  });

  it('collects toolCalls in the response when a tool is called', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu1', name: 'buscar_historico_lead', input: {} }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 8, output_tokens: 4 },
      })
      .mockResolvedValueOnce(assistantTextResponse('Seu histórico: sem compras anteriores.'));

    const { deps } = makeSandboxDeps(create);
    const result = await processMessage(sandboxInput, deps);

    expect(result.status).toBe('sandbox');
    if (result.status === 'sandbox') {
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]!.toolName).toBe('buscar_historico_lead');
      expect(result.toolCalls[0]!.durationMs).toBeTypeOf('number');
    }
    // saveToolCall must still NOT be called in sandbox.
    expect(mem.saveToolCall).not.toHaveBeenCalled();
  });

  it('aborts with agent_inactive when agentConfig.ativo is false', async () => {
    dbState.agentConfig = { ...dbState.agentConfig!, ativo: false };
    const { deps } = makeSandboxDeps();
    const result = await processMessage(sandboxInput, deps);
    expect(result.status).toBe('aborted');
    if (result.status === 'aborted') {
      expect(result.reason).toBe('agent_inactive');
    }
  });

  it('uses seedHistory as the starting context without DB reads', async () => {
    const create = vi.fn(async () => assistantTextResponse('Que bom te ver novamente!'));
    const { deps } = makeSandboxDeps(create);
    const inputWithSeed: ProcessMessageInput = {
      ...sandboxInput,
      seedHistory: [
        { role: 'user', content: 'Oi, quero comprar.' },
        { role: 'assistant', content: 'Olá! Ficamos felizes em ter você de volta.' },
      ],
    };
    const result = await processMessage(inputWithSeed, deps);
    expect(result.status).toBe('sandbox');
    // getThreadHistory must not be called — history came from seedHistory.
    expect(mem.getThreadHistory).not.toHaveBeenCalled();
    // Verify the seed was passed: the Anthropic create call should see the seeded messages.
    const firstCall = (create.mock.calls as unknown as Array<[{ messages: Array<{ role: string }> }]>)[0];
    expect(firstCall![0].messages.length).toBeGreaterThanOrEqual(3); // 2 seed + 1 new user
  });
});
