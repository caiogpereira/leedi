import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const METHOD_ID = '22222222-2222-4222-8222-222222222222';

// Mutable fixtures the mock reads/writes so each test controls the DB state.
let existingConfigRows: unknown[] = [];
let tenantConfig: Record<string, unknown> = {};
const insertedValues: unknown[] = [];
const tenantUpdateCalls: unknown[] = [];

vi.mock('@leedi/db', () => {
  // Minimal chainable query-builder mock.
  function makeSelect() {
    return {
      from(table: { __name: string }) {
        return {
          where() {
            return {
              limit() {
                if (table.__name === 'agentConfigs') return Promise.resolve(existingConfigRows);
                if (table.__name === 'tenants') return Promise.resolve([{ config: tenantConfig }]);
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    };
  }

  const tx = {
    select: () => makeSelect(),
    insert: () => ({
      values(v: unknown) {
        insertedValues.push(v);
        // Simulate the row now existing after insert.
        existingConfigRows = [
          {
            id: 'cfg-1',
            tenantId: TENANT_ID,
            salesMethodId: (v as { salesMethodId?: string }).salesMethodId ?? null,
            nomeAgente: 'Assistente',
            modeloIa: 'sonnet',
            ativo: true,
          },
        ];
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
    update: () => ({
      set(v: unknown) {
        tenantUpdateCalls.push(v);
        return { where: () => Promise.resolve() };
      },
    }),
  };

  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: {
      agentConfigs: { __name: 'agentConfigs', tenantId: 'agent_configs.tenant_id' },
      tenants: { __name: 'tenants', id: 'tenants.id', config: 'tenants.config' },
    },
    eq: vi.fn(),
    sql: Object.assign(
      (strings: TemplateStringsArray, ..._v: unknown[]) => ({ __sql: strings.join('?') }),
      {}
    ),
  };
});

describe('getOrCreateAgentConfig', () => {
  beforeEach(() => {
    existingConfigRows = [];
    tenantConfig = {};
    insertedValues.length = 0;
    tenantUpdateCalls.length = 0;
    vi.clearAllMocks();
  });

  it('returns the existing config when one already exists', async () => {
    existingConfigRows = [
      { id: 'cfg-existing', tenantId: TENANT_ID, nomeAgente: 'Mari', modeloIa: 'sonnet', ativo: true },
    ];
    const { getOrCreateAgentConfig } = await import('../get-or-create-agent-config.js');
    const result = await getOrCreateAgentConfig(TENANT_ID);
    expect(result.id).toBe('cfg-existing');
    expect(result.nomeAgente).toBe('Mari');
    // No insert should have run.
    expect(insertedValues).toHaveLength(0);
  });

  it('creates the default config when none exists', async () => {
    const { getOrCreateAgentConfig } = await import('../get-or-create-agent-config.js');
    const result = await getOrCreateAgentConfig(TENANT_ID);
    expect(insertedValues).toHaveLength(1);
    expect(result.tenantId).toBe(TENANT_ID);
    expect(result.nomeAgente).toBe('Assistente');
    expect(result.modeloIa).toBe('sonnet');
    expect(result.ativo).toBe(true);
  });

  it('migrates tenant_sales_method_preference into sales_method_id and removes the key (WARNING-4)', async () => {
    tenantConfig = { tenant_sales_method_preference: METHOD_ID };
    const { getOrCreateAgentConfig } = await import('../get-or-create-agent-config.js');
    const result = await getOrCreateAgentConfig(TENANT_ID);
    // The insert carried the migrated sales_method_id.
    expect((insertedValues[0] as { salesMethodId?: string }).salesMethodId).toBe(METHOD_ID);
    expect(result.salesMethodId).toBe(METHOD_ID);
    // The temporary key was removed via a tenants update.
    expect(tenantUpdateCalls).toHaveLength(1);
  });

  it('does not touch tenants.config when no preference is present', async () => {
    tenantConfig = {};
    const { getOrCreateAgentConfig } = await import('../get-or-create-agent-config.js');
    await getOrCreateAgentConfig(TENANT_ID);
    expect(tenantUpdateCalls).toHaveLength(0);
  });
});
