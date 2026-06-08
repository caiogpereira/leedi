import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const LEAD_ID = 'lead-1';
const RULE_ID = 'rule-1';

let selectResults: unknown[][] = [];
const insertValues = vi.fn();
const sendTemplate = vi.fn(async () => ({ messageId: 'wamid-1' }));

vi.mock('@leedi/connection', () => ({
  MetaCloudProvider: class {
    sendTemplate = sendTemplate;
  },
}));

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
      insert: () => ({
        values: (v: unknown) => {
          insertValues(v);
          return Promise.resolve([]);
        },
      }),
    })
  ),
  schema: {
    dispatchTargets: { id: {}, tenantId: {}, leadId: {}, dispatchRuleId: {}, createdAt: {} },
    dispatchRules: { id: {}, ativo: {}, templateId: {}, tenantId: {} },
    templates: { id: {}, nome: {}, status: {} },
    leads: { id: {}, telefone: {}, status: {}, comprou: {}, tenantId: {} },
    whatsappConnections: { tenantId: {} },
  },
  eq: vi.fn(() => ({})),
  and: vi.fn((...a: unknown[]) => a),
  sql: Object.assign((s: TemplateStringsArray, ...v: unknown[]) => ({ raw: s.join('?'), v }), {}),
}));

beforeEach(() => {
  selectResults = [];
  insertValues.mockClear();
  sendTemplate.mockClear();
});

describe('dispatchRecoveryTarget', () => {
  it('dedups when a target exists within 24h', async () => {
    selectResults = [[{ id: 'existing-target' }]]; // dedup query hits
    const { dispatchRecoveryTarget } = await import('../dispatch-recovery-target.js');
    const result = await dispatchRecoveryTarget({ leadId: LEAD_ID, dispatchRuleId: RULE_ID, tenantId: TENANT_ID });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('dedup');
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('records a falhou target when the template is not aprovado', async () => {
    selectResults = [
      [], // dedup: none
      [{ id: RULE_ID, ativo: true, templateId: 't1' }], // rule
      [{ nome: 'tpl', status: 'pendente' }], // template (not aprovado)
      [{ telefone: '+55', status: 'ativo', comprou: false }], // lead
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv', qualityRating: 'verde' }], // connection
    ];
    const { dispatchRecoveryTarget } = await import('../dispatch-recovery-target.js');
    const result = await dispatchRecoveryTarget({ leadId: LEAD_ID, dispatchRuleId: RULE_ID, tenantId: TENANT_ID });
    expect(result.status).toBe('falhou');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'falhou', motivoExclusao: 'template_nao_aprovado' })
    );
  });

  it('records a falhou target when quality is vermelho', async () => {
    selectResults = [
      [],
      [{ id: RULE_ID, ativo: true, templateId: 't1' }],
      [{ nome: 'tpl', status: 'aprovado' }],
      [{ telefone: '+55', status: 'ativo', comprou: false }],
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv', qualityRating: 'vermelho' }],
    ];
    const { dispatchRecoveryTarget } = await import('../dispatch-recovery-target.js');
    const result = await dispatchRecoveryTarget({ leadId: LEAD_ID, dispatchRuleId: RULE_ID, tenantId: TENANT_ID });
    expect(result.status).toBe('falhou');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ motivoExclusao: 'quality_red' })
    );
  });

  it('excludes an optout lead', async () => {
    selectResults = [
      [],
      [{ id: RULE_ID, ativo: true, templateId: 't1' }],
      [{ nome: 'tpl', status: 'aprovado' }],
      [{ telefone: '+55', status: 'optout', comprou: false }],
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv', qualityRating: 'verde' }],
    ];
    const { dispatchRecoveryTarget } = await import('../dispatch-recovery-target.js');
    const result = await dispatchRecoveryTarget({ leadId: LEAD_ID, dispatchRuleId: RULE_ID, tenantId: TENANT_ID });
    expect(result.status).toBe('excluido');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'excluido', motivoExclusao: 'optout' })
    );
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('sends the template and records the wamid for an eligible lead', async () => {
    selectResults = [
      [],
      [{ id: RULE_ID, ativo: true, templateId: 't1' }],
      [{ nome: 'recovery_tpl', status: 'aprovado' }],
      [{ telefone: '+5511999999999', status: 'ativo', comprou: false }],
      [{ phoneNumberId: 'p', wabaId: 'w', accessTokenEncrypted: 'e', accessTokenIv: 'iv', qualityRating: 'verde' }],
    ];
    const { dispatchRecoveryTarget } = await import('../dispatch-recovery-target.js');
    const result = await dispatchRecoveryTarget({ leadId: LEAD_ID, dispatchRuleId: RULE_ID, tenantId: TENANT_ID });
    expect(sendTemplate).toHaveBeenCalledWith('+5511999999999', 'recovery_tpl', []);
    expect(result.status).toBe('enviado');
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'enviado', wamid: 'wamid-1' })
    );
  });
});
