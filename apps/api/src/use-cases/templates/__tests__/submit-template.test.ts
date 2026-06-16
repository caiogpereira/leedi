import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

const DRAFT_TEMPLATE = {
  id: TEMPLATE_ID,
  tenantId: TENANT_ID,
  connectionId: CONNECTION_ID,
  nome: 'boas_vindas',
  categoria: 'marketing',
  idioma: 'pt_BR',
  componentes: { body: { type: 'BODY', text: 'Olá, {{1}}!' } },
  variaveis: [{ index: 1, exemplo: 'João' }],
  metaTemplateId: null,
  status: 'rascunho',
  motivoRejeicao: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const CONNECTION_ROW = {
  id: CONNECTION_ID,
  wabaId: 'waba-123',
  phoneNumberId: 'phone-456',
  accessTokenEncrypted: 'enc',
  accessTokenIv: 'iv',
};

let updatedValues: unknown[] = [];
let shouldAdapterThrow = false;
// F-20: lets a test drive the draft's variables (e.g. a blank example).
let draftVariaveis: { index: number; exemplo: string }[] = [{ index: 1, exemplo: 'João' }];

// Mock class constructor properly
vi.mock('@leedi/connection', () => ({
  MetaCloudProvider: class {
    submitTemplate() {
      if (shouldAdapterThrow) {
        return Promise.reject(new Error('duplicate template name'));
      }
      return Promise.resolve({ metaTemplateId: 'meta-999' });
    }
  },
}));

vi.mock('@leedi/db', () => {
  // Unified tx supporting both select (load template) and update (flip status),
  // so the mock does not depend on call-count parity (which leaked across tests).
  return {
    withTenant: vi.fn((_tenantId: string, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ ...DRAFT_TEMPLATE, variaveis: draftVariaveis }]),
            }),
          }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => {
                const updated = { ...DRAFT_TEMPLATE, status: 'pendente', metaTemplateId: 'meta-999' };
                updatedValues.push(updated);
                return Promise.resolve([updated]);
              },
            }),
          }),
        }),
      })
    ),
    withServiceRole: vi.fn((_fn: (tx: unknown) => unknown) =>
      _fn({
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve([CONNECTION_ROW]),
              }),
            }),
          }),
        }),
      })
    ),
    schema: {
      templates: { tenantId: {}, id: {} },
      whatsappConnections: { tenantId: {}, id: {}, createdAt: {} },
    },
    eq: vi.fn(),
    and: vi.fn(),
  };
});

vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  updatedValues = [];
  shouldAdapterThrow = false;
  draftVariaveis = [{ index: 1, exemplo: 'João' }];
  vi.clearAllMocks();
});

describe('submitTemplate', () => {
  it('calls adapter and updates status to pendente on success', async () => {
    const { submitTemplate } = await import('../submit-template.js');
    const result = await submitTemplate(TENANT_ID, TEMPLATE_ID);

    expect(result.status).toBe('pendente');
    expect(result.metaTemplateId).toBe('meta-999');
    expect(updatedValues).toHaveLength(1);
  });

  it('does NOT update status when adapter throws', async () => {
    shouldAdapterThrow = true;
    const { submitTemplate } = await import('../submit-template.js');
    await expect(submitTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(
      'duplicate template name'
    );
    expect(updatedValues).toHaveLength(0);
  });

  // F-20: a rascunho may be saved with blank variable examples, but submitting
  // it must be rejected up front (never reaches Meta, never flips status).
  it('rejects submit when a variable has a blank example', async () => {
    draftVariaveis = [{ index: 1, exemplo: '' }];
    const { submitTemplate } = await import('../submit-template.js');
    await expect(submitTemplate(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(
      /exemplo para cada variável/
    );
    expect(updatedValues).toHaveLength(0);
  });
});
