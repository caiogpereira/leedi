import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CreateCampaignInput } from '../create-campaign.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

let insertedValues: unknown[] = [];

vi.mock('@leedi/db', () => {
  const insertedRow = {
    id: 'campaign-1',
    tenantId: TENANT_ID,
    nome: 'Test',
    tipo: 'lancamento',
    fase: 'aquecimento',
    status: 'rascunho',
    produtoId: null,
    dataInicio: null,
    dataFim: null,
    config: {},
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
    schema: {
      campaigns: { __name: 'campaigns' },
    },
  };
});

beforeEach(() => { insertedValues = []; });

describe('createCampaign', () => {
  it('defaults fase to aquecimento and status to rascunho', async () => {
    const { createCampaign } = await import('../create-campaign.js');
    const input: CreateCampaignInput = { nome: 'Campanha Teste', tipo: 'lancamento' };
    const result = await createCampaign(TENANT_ID, input);

    expect(result.fase).toBe('aquecimento');
    expect(result.status).toBe('rascunho');

    const inserted = insertedValues[0] as Record<string, unknown>;
    expect(inserted.fase).toBe('aquecimento');
    expect(inserted.status).toBe('rascunho');
    expect(inserted.tenantId).toBe(TENANT_ID);
  });

  it('sets produtoId to null when not provided', async () => {
    const { createCampaign } = await import('../create-campaign.js');
    const result = await createCampaign(TENANT_ID, { nome: 'Test', tipo: 'perpetuo' });
    expect(result.produtoNome).toBeNull();
  });
});
