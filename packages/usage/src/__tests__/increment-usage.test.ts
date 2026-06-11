import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB state ─────────────────────────────────────────────────────────────────
// incrementUsage calls withTenant in this order:
//   call 0 → read tenant (plan, config)
//   call 1 → read counter
//   call 2 → execute upsert
//   call 3 → re-read counter (for alert detection)
//   call 4+ → alertas_enviados UPDATE(s)

const state = vi.hoisted(() => ({
  tenantRow: null as Record<string, unknown> | null,
  counterRow: null as Record<string, unknown> | null,
  updatedRow: null as Record<string, unknown> | null,
  executes: [] as string[],
  withTenantCallCount: 0,
}));

vi.mock('@leedi/db', () => {
  function makeSelectChain(row: Record<string, unknown> | null) {
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.from = () => chain;
    chain.where = () => chain;
    chain.innerJoin = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(row ? [row] : []);
    return chain;
  }

  function makeTx(callIdx: number) {
    const tx = {
      select: () => {
        // 0 = tenant, 1 = counter before upsert, 3 = counter after upsert
        if (callIdx === 0) return makeSelectChain(state.tenantRow);
        if (callIdx === 1) return makeSelectChain(state.counterRow);
        return makeSelectChain(state.updatedRow ?? state.counterRow);
      },
      execute: (sqlTag: unknown) => {
        state.executes.push(String(sqlTag));
        // RETURNING "id" on the guarded alert UPDATE yields a row when the key is
        // newly inserted; the dedup fast path (sent.includes) covers the "already
        // sent" case, so returning a row here is the correct default.
        return Promise.resolve([{ id: 'row-1' }]);
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };
    return tx;
  }

  return {
    withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => {
      const idx = state.withTenantCallCount++;
      return fn(makeTx(idx));
    }),
    withServiceRole: vi.fn((_fn: (tx: unknown) => unknown) => _fn(makeTx(0))),
    schema: {
      tenants: { id: 't.id', plan: 't.plan', config: 't.config' },
      usageCounters: {
        tenantId: 'uc.tenant_id',
        periodo: 'uc.periodo',
        conversasUsadas: 'uc.conversas_usadas',
        conversasLimite: 'uc.conversas_limite',
        overageConversas: 'uc.overage_conversas',
        overageValor: 'uc.overage_valor',
        alertasEnviados: 'uc.alertas_enviados',
        custoIaUsd: 'uc.custo_ia_usd',
      },
    },
    eq: vi.fn(() => 'eq'),
    and: vi.fn((...args: unknown[]) => args),
    desc: vi.fn(),
    gte: vi.fn(),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        let result = '';
        strings.forEach((s, i) => {
          result += s;
          if (i < values.length) result += String(values[i]);
        });
        return result;
      },
      { raw: (s: string) => s }
    ),
  };
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('incrementUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.withTenantCallCount = 0;
    state.tenantRow = { plan: 'starter', config: {} };
    state.counterRow = null;
    state.updatedRow = null;
    state.executes = [];
  });

  it('billable=false, no aiCostUsd — emits no SQL execute', async () => {
    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: false });

    expect(result.blocked).toBe(false);
    expect(result.alertsDue).toHaveLength(0);
    expect(state.executes).toHaveLength(0);
  });

  it('billable=false, aiCostUsd provided — emits cost-only upsert', async () => {
    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: false, aiCostUsd: 0.005 });

    expect(result.blocked).toBe(false);
    expect(state.executes.length).toBeGreaterThan(0);
    expect(state.executes[0]).toContain('custo_ia_usd');
  });

  it('billable=true — emits conversation upsert SQL', async () => {
    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: true });

    expect(result.blocked).toBe(false);
    expect(state.executes.length).toBeGreaterThan(0);
    expect(state.executes[0]).toContain('conversas_usadas');
  });

  it('blocked when bloquear=true and usadas >= limite', async () => {
    state.tenantRow = { plan: 'starter', config: { bloquear_ao_atingir_limite: true } };
    state.counterRow = {
      conversasUsadas: 500,
      conversasLimite: 500,
      overageConversas: 0,
      overageValor: '0.00',
      alertasEnviados: [],
    };

    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: true });

    expect(result.blocked).toBe(true);
    expect(result.alertsDue).toHaveLength(0);
    expect(state.executes).toHaveLength(0);
  });

  it('not blocked when bloquear=false even at limit — increments overage', async () => {
    state.tenantRow = { plan: 'starter', config: { bloquear_ao_atingir_limite: false } };
    state.counterRow = {
      conversasUsadas: 500,
      conversasLimite: 500,
      overageConversas: 0,
      overageValor: '0.00',
      alertasEnviados: [],
    };
    state.updatedRow = {
      conversasUsadas: 500,
      conversasLimite: 500,
      overageConversas: 1,
      overageValor: '0.30',
      alertasEnviados: ['100'],
    };

    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: true });

    expect(result.blocked).toBe(false);
    expect(state.executes.length).toBeGreaterThan(0);
    expect(state.executes[0]).toContain('overage_conversas');
  });

  it('emits 80% threshold alert when usage crosses 80%', async () => {
    state.tenantRow = { plan: 'starter', config: {} };
    state.counterRow = null;
    // After upsert, 400/500 = 80%
    state.updatedRow = {
      conversasUsadas: 400,
      conversasLimite: 500,
      overageConversas: 0,
      overageValor: '0.00',
      alertasEnviados: [],
    };

    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: true });

    expect(result.alertsDue.some((a) => a.titulo === 'Uso em 80%')).toBe(true);
  });

  it('does NOT emit duplicate alert when threshold already in alertas_enviados', async () => {
    state.tenantRow = { plan: 'starter', config: {} };
    state.counterRow = null;
    state.updatedRow = {
      conversasUsadas: 400,
      conversasLimite: 500,
      overageConversas: 0,
      overageValor: '0.00',
      alertasEnviados: ['80'], // already sent
    };

    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: true });

    expect(result.alertsDue.filter((a) => a.titulo === 'Uso em 80%')).toHaveLength(0);
  });

  it('does NOT emit overage alert when notificar_overage_a_cada is 0 (disabled)', async () => {
    state.tenantRow = { plan: 'starter', config: { notificar_overage_a_cada: 0 } };
    state.counterRow = null;
    state.updatedRow = {
      conversasUsadas: 500,
      conversasLimite: 500,
      overageConversas: 400,
      overageValor: '120.00', // would cross the R$100 milestone if enabled
      alertasEnviados: ['80', '95', '100'],
    };

    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    const result = await incrementUsage({ tenantId: 't1', billable: true });

    expect(result.alertsDue.some((a) => a.tipo === 'alerta_overage')).toBe(false);
  });

  it('custo_ia_usd included in billable upsert when aiCostUsd provided', async () => {
    const { incrementUsage } = await import('../use-cases/increment-usage.js');
    await incrementUsage({ tenantId: 't1', billable: true, aiCostUsd: 0.002 });

    expect(state.executes[0]).toContain('custo_ia_usd');
    expect(state.executes[0]).toContain('0.002');
  });
});

describe('currentPeriod', () => {
  it('returns YYYY-MM format', async () => {
    const { currentPeriod } = await import('../use-cases/increment-usage.js');
    const period = currentPeriod();
    expect(period).toMatch(/^\d{4}-\d{2}$/);
  });
});
