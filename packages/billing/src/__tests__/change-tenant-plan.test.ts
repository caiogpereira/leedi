import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaymentProvider } from '../ports/payment-provider.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const state = vi.hoisted(() => ({
  subscription: null as Record<string, unknown> | null,
  serviceRoleCallCount: 0,
  updateCount: 0,
  auditInserted: false,
}));

vi.mock('@leedi/db', () => {
  function makeSelectChain(row: Record<string, unknown> | null) {
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(row ? [row] : []);
    return chain;
  }

  function makeTx(idx: number) {
    if (idx === 0) {
      return { select: () => makeSelectChain(state.subscription) };
    }
    return {
      update: () => ({
        set: () => ({
          where: () => {
            state.updateCount++;
            return Promise.resolve([]);
          },
        }),
      }),
      insert: () => ({
        values: () => {
          state.auditInserted = true;
          return Promise.resolve([]);
        },
      }),
    };
  }

  return {
    withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn(makeTx(state.serviceRoleCallCount++))
    ),
    schema: {
      subscriptions: {
        id: 's.id',
        tenantId: 's.tenant_id',
        status: 's.status',
        createdAt: 's.created_at',
      },
      tenants: { id: 't.id' },
      auditLogs: { acao: 'al.acao' },
    },
    eq: vi.fn(() => 'eq'),
    ne: vi.fn(() => 'ne'),
    and: vi.fn(() => 'and'),
    desc: vi.fn(() => 'desc'),
  };
});

function makeProvider(overrides?: Partial<PaymentProvider>): PaymentProvider {
  return {
    criarCliente: vi.fn(),
    criarAssinatura: vi.fn(),
    cancelarAssinatura: vi.fn(),
    atualizarAssinatura: vi.fn().mockResolvedValue(undefined),
    verificarWebhook: vi.fn(),
    ...overrides,
  };
}

describe('changeTenantPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.subscription = null;
    state.serviceRoleCallCount = 0;
    state.updateCount = 0;
    state.auditInserted = false;
  });

  it('updates Asaas then persists subscription + tenant + audit on the happy path', async () => {
    state.subscription = { id: 'sub-1', plano: 'starter', asaasSubscriptionId: 'asaas-sub-1' };
    const { changeTenantPlan } = await import('../use-cases/change-tenant-plan.js');
    const provider = makeProvider();

    const res = await changeTenantPlan(
      { tenantId: TENANT_ID, novoPlano: 'pro', workspaceId: 'ws', actorUserId: 'admin' },
      provider
    );

    expect(res).toEqual({ success: true, valor: 1497 });
    expect(provider.atualizarAssinatura).toHaveBeenCalledWith('asaas-sub-1', 'pro', 1497);
    // subscriptions + tenants updates, plus the audit insert.
    expect(state.updateCount).toBe(2);
    expect(state.auditInserted).toBe(true);
  });

  it('returns an error and never touches Asaas when there is no active subscription', async () => {
    state.subscription = null;
    const { changeTenantPlan } = await import('../use-cases/change-tenant-plan.js');
    const provider = makeProvider();

    const res = await changeTenantPlan(
      { tenantId: TENANT_ID, novoPlano: 'pro', workspaceId: 'ws', actorUserId: 'admin' },
      provider
    );

    expect(res.success).toBe(false);
    expect(provider.atualizarAssinatura).not.toHaveBeenCalled();
    expect(state.updateCount).toBe(0);
  });

  it('rejects a no-op change to the same plan before any Asaas call', async () => {
    state.subscription = { id: 'sub-1', plano: 'pro', asaasSubscriptionId: 'asaas-sub-1' };
    const { changeTenantPlan } = await import('../use-cases/change-tenant-plan.js');
    const provider = makeProvider();

    const res = await changeTenantPlan(
      { tenantId: TENANT_ID, novoPlano: 'pro', workspaceId: 'ws', actorUserId: 'admin' },
      provider
    );

    expect(res.success).toBe(false);
    expect(provider.atualizarAssinatura).not.toHaveBeenCalled();
  });

  it('requires valorEnterprise for the enterprise plan (no Asaas call)', async () => {
    state.subscription = { id: 'sub-1', plano: 'starter', asaasSubscriptionId: 'asaas-sub-1' };
    const { changeTenantPlan } = await import('../use-cases/change-tenant-plan.js');
    const provider = makeProvider();

    const res = await changeTenantPlan(
      { tenantId: TENANT_ID, novoPlano: 'enterprise', workspaceId: 'ws', actorUserId: 'admin' },
      provider
    );

    expect(res.success).toBe(false);
    expect(provider.atualizarAssinatura).not.toHaveBeenCalled();
  });

  it('aborts all DB writes when the Asaas update fails', async () => {
    state.subscription = { id: 'sub-1', plano: 'starter', asaasSubscriptionId: 'asaas-sub-1' };
    const { changeTenantPlan } = await import('../use-cases/change-tenant-plan.js');
    const provider = makeProvider({
      atualizarAssinatura: vi.fn().mockRejectedValue(new Error('Asaas 400')),
    });

    await expect(
      changeTenantPlan(
        { tenantId: TENANT_ID, novoPlano: 'pro', workspaceId: 'ws', actorUserId: 'admin' },
        provider
      )
    ).rejects.toThrow('Asaas 400');

    expect(state.updateCount).toBe(0);
    expect(state.auditInserted).toBe(false);
  });
});
