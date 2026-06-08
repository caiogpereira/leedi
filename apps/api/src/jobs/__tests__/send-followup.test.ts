import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const FU_ID = 'followup-1';

let selectResults: unknown[][] = [];
const updateSet = vi.fn();
const insertValues = vi.fn();
const sendText = vi.fn(async () => ({ messageId: 'wamid-1' }));
const publishJSON = vi.fn(async () => ({ messageId: 'm1' }));

vi.mock('@upstash/qstash', () => ({ Client: class { publishJSON = publishJSON; } }));
vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'tok', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: '3003' },
}));
vi.mock('@leedi/connection', () => ({ MetaCloudProvider: class { sendText = sendText; } }));
vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

function leaf() {
  return Promise.resolve(selectResults.shift() ?? []);
}

vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.from = () => chain;
        chain.where = () => ({ limit: leaf });
        return chain;
      },
      update: () => ({ set: (v: unknown) => { updateSet(v); return { where: () => Promise.resolve([]) }; } }),
      insert: () => ({ values: (v: unknown) => { insertValues(v); return Promise.resolve([]); } }),
    })
  ),
  schema: {
    followups: { id: {}, status: {}, leadId: {}, conversationWindowId: {}, conteudoSugerido: {}, tenantId: {} },
    leads: { id: {}, telefone: {}, comprou: {}, tenantId: {} },
    conversationWindows: { id: {}, tenantId: {}, endedAt: {}, startedAt: {} },
    whatsappConnections: { tenantId: {} },
    dispatchRules: { id: {}, ativo: {}, tenantId: {} },
    messages: {},
  },
  eq: vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => a),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ raw: s.join('?'), v }), {}),
}));

beforeEach(() => {
  selectResults = [];
  updateSet.mockClear();
  insertValues.mockClear();
  sendText.mockClear();
  publishJSON.mockClear();
});

describe('sendFollowup', () => {
  it('skips when the followup is not agendado', async () => {
    selectResults = [
      [{ id: FU_ID, status: 'enviado', leadId: 'l1', conversationWindowId: 'w1', conteudoSugerido: null }],
      [{ telefone: '+55', comprou: false }], // lead
      [], // window check
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }],
    ];
    const { sendFollowup } = await import('../send-followup.js');
    const result = await sendFollowup({ followupId: FU_ID, tenantId: TENANT_ID });
    expect(result.skipped).toBe(true);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('cancels when the lead has converted', async () => {
    selectResults = [
      [{ id: FU_ID, status: 'agendado', leadId: 'l1', conversationWindowId: 'w1', conteudoSugerido: null }],
      [{ telefone: '+55', comprou: true }],
      [{ id: 'w1' }],
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }],
    ];
    const { sendFollowup } = await import('../send-followup.js');
    const result = await sendFollowup({ followupId: FU_ID, tenantId: TENANT_ID });
    expect(result.status).toBe('cancelado');
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelado' }));
  });

  it('sends free text when the window is open', async () => {
    selectResults = [
      [{ id: FU_ID, status: 'agendado', leadId: 'l1', conversationWindowId: 'w1', conteudoSugerido: 'Volte!' }],
      [{ telefone: '+5511999999999', comprou: false }],
      [{ id: 'w1' }], // window open
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }],
    ];
    const { sendFollowup } = await import('../send-followup.js');
    const result = await sendFollowup({ followupId: FU_ID, tenantId: TENANT_ID });
    expect(sendText).toHaveBeenCalledWith('+5511999999999', 'Volte!');
    expect(result.status).toBe('enviado');
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'enviado' }));
  });

  it('marks janela_fechada and falls back to a re-engagement rule when window closed', async () => {
    selectResults = [
      [{ id: FU_ID, status: 'agendado', leadId: 'l1', conversationWindowId: 'w1', conteudoSugerido: null }],
      [{ telefone: '+55', comprou: false }],
      [], // window closed
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv' }],
      [{ id: 'rule-1' }], // active rule fallback
    ];
    const { sendFollowup } = await import('../send-followup.js');
    const result = await sendFollowup({ followupId: FU_ID, tenantId: TENANT_ID });
    expect(result.status).toBe('janela_fechada');
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'janela_fechada' }));
    expect(publishJSON).toHaveBeenCalledTimes(1);
  });
});
