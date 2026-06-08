import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

let insertedValues: unknown[] = [];

vi.mock('@leedi/db', () => {
  const insertedRow = {
    id: 'template-1',
    tenantId: TENANT_ID,
    nome: 'test_template',
    categoria: 'marketing',
    idioma: 'pt_BR',
    componentes: { body: { type: 'BODY', text: 'Olá!' } },
    variaveis: [],
    metaTemplateId: null,
    status: 'rascunho',
    motivoRejeicao: null,
    connectionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const tx = {
    insert: () => ({
      values(v: unknown) {
        insertedValues.push(v);
        return { returning: () => Promise.resolve([{ ...insertedRow, ...(v as object) }]) };
      },
    }),
  };

  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: { templates: { __name: 'templates' } },
  };
});

beforeEach(() => { insertedValues = []; });

describe('createTemplate', () => {
  it('creates with status rascunho by default', async () => {
    const { createTemplate } = await import('../create-template.js');
    const result = await createTemplate(TENANT_ID, {
      nome: 'test_template',
      categoria: 'marketing',
      idioma: 'pt_BR',
      componentes: { body: { type: 'BODY', text: 'Olá!' } },
      variaveis: [],
    });

    expect(result.status).toBe('rascunho');
    const inserted = insertedValues[0] as Record<string, unknown>;
    expect(inserted.status).toBe('rascunho');
    expect(inserted.tenantId).toBe(TENANT_ID);
  });

  it('Zod validation rejects componentes missing required body', async () => {
    const { CreateTemplateSchema } = await import('../create-template.js');
    const parsed = CreateTemplateSchema.safeParse({
      nome: 'test',
      categoria: 'marketing',
      componentes: { header: { type: 'HEADER', format: 'TEXT', text: 'Hi' } }, // no body
    });
    expect(parsed.success).toBe(false);
  });

  it('Zod validation rejects nome with spaces', async () => {
    const { CreateTemplateSchema } = await import('../create-template.js');
    const parsed = CreateTemplateSchema.safeParse({
      nome: 'nome com espacos',
      categoria: 'marketing',
      componentes: { body: { type: 'BODY', text: 'Olá!' } },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('extractVariableIndices', () => {
  it('extracts indices from body text', async () => {
    const { extractVariableIndices } = await import('../create-template.js');
    const indices = extractVariableIndices('Olá {{1}}, sua compra de {{2}} foi confirmada!');
    expect(indices).toEqual([1, 2]);
  });

  it('deduplicates indices', async () => {
    const { extractVariableIndices } = await import('../create-template.js');
    const indices = extractVariableIndices('{{1}} e {{1}} novamente');
    expect(indices).toEqual([1]);
  });

  it('returns empty array for text without variables', async () => {
    const { extractVariableIndices } = await import('../create-template.js');
    const indices = extractVariableIndices('Olá! Sem variáveis.');
    expect(indices).toEqual([]);
  });
});
