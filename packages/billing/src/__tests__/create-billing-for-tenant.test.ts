import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaymentProvider } from '../ports/payment-provider.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VALID_CPF = '52998224725'; // valid CPF (check digits) for Asaas customer creation

// ─── DB mock state ────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  existingSubscription: null as Record<string, unknown> | null,
  insertedSubscription: null as Record<string, unknown> | null,
  auditLogInserted: false,
  tenantConfigUpdated: false,
  serviceRoleCallCount: 0,
  sqlExecuted: [] as string[],
}));

vi.mock('@leedi/db', () => {
  function makeSelectChain(row: Record<string, unknown> | null) {
    const chain: Record<string, (...a: unknown[]) => unknown> = {};
    chain.select = () => chain;
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(row ? [row] : []);
    return chain;
  }

  function makeInsertChain() {
    return {
      values: vi.fn().mockResolvedValue([]),
    };
  }

  function makeTx(callIdx: number) {
    return {
      select: () => {
        if (callIdx === 0) return makeSelectChain(state.existingSubscription);
        return makeSelectChain(null);
      },
      insert: vi.fn().mockImplementation((table: unknown) => {
        if (table && typeof table === 'object' && 'acao' in (table as Record<string, unknown>)) {
          // audit_log insert
        }
        state.auditLogInserted = true;
        return makeInsertChain();
      }),
      execute: vi.fn().mockImplementation((sqlTag: unknown) => {
        const s = String(sqlTag);
        state.sqlExecuted.push(s);
        if (s.includes('billing_status')) {
          state.tenantConfigUpdated = true;
        }
        return Promise.resolve([]);
      }),
    };
  }

  return {
    withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const idx = state.serviceRoleCallCount++;
      return fn(makeTx(idx));
    }),
    schema: {
      subscriptions: { id: 's.id', tenantId: 's.tenant_id' },
      auditLogs: { acao: 'al.acao' },
    },
    eq: vi.fn(() => 'eq'),
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

// ─── Provider mock ────────────────────────────────────────────────────────────

function makeProvider(overrides?: Partial<PaymentProvider>): PaymentProvider {
  return {
    criarCliente: vi.fn().mockResolvedValue('asaas-customer-123'),
    criarAssinatura: vi.fn().mockResolvedValue({
      subscriptionId: 'asaas-sub-456',
      proximoVencimento: new Date('2026-07-03'),
    }),
    cancelarAssinatura: vi.fn().mockResolvedValue(undefined),
    atualizarAssinatura: vi.fn().mockResolvedValue(undefined),
    criarCobrancaAvulsa: vi.fn().mockResolvedValue({
      paymentId: 'pay-1',
      vencimento: '2026-07-10',
      invoiceUrl: null,
    }),
    verificarWebhook: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createBillingForTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.existingSubscription = null;
    state.insertedSubscription = null;
    state.auditLogInserted = false;
    state.tenantConfigUpdated = false;
    state.serviceRoleCallCount = 0;
    state.sqlExecuted = [];
  });

  it('success path — creates Asaas customer, subscription, and persists subscriptions row', async () => {
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider();

    await createBillingForTenant(
      { tenantId: TENANT_ID, nome: 'Tenant A', ownerEmail: 'owner@example.com', cpfCnpj: VALID_CPF, plano: 'starter' },
      provider
    );

    expect(provider.criarCliente).toHaveBeenCalledWith({
      nome: 'Tenant A',
      email: 'owner@example.com',
      cpfCnpj: VALID_CPF,
    });
    expect(provider.criarAssinatura).toHaveBeenCalledWith(
      'asaas-customer-123',
      'starter',
      697.0
    );
    // At minimum: 1 select (idempotency) + 1 insert (subscription)
    expect(state.serviceRoleCallCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects an invalid cpfCnpj before any Asaas call or DB side effect', async () => {
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider();

    await expect(
      createBillingForTenant(
        { tenantId: TENANT_ID, nome: 'Tenant A', ownerEmail: 'owner@example.com', cpfCnpj: '12345678900', plano: 'starter' },
        provider
      )
    ).rejects.toThrow('cpfCnpj inválido');

    expect(provider.criarCliente).not.toHaveBeenCalled();
    expect(state.serviceRoleCallCount).toBe(0);
  });

  it('idempotency — second call with same tenant is no-op (no duplicate DB insert)', async () => {
    state.existingSubscription = { id: 'existing-sub-id' };
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider();

    await createBillingForTenant(
      { tenantId: TENANT_ID, nome: 'Tenant A', ownerEmail: 'owner@example.com', cpfCnpj: VALID_CPF, plano: 'starter' },
      provider
    );

    expect(provider.criarCliente).not.toHaveBeenCalled();
    expect(provider.criarAssinatura).not.toHaveBeenCalled();
    // Only the idempotency check select
    expect(state.serviceRoleCallCount).toBe(1);
  });

  it('criarCliente failure — writes audit_log, updates tenant billing_status, rethrows', async () => {
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider({
      criarCliente: vi.fn().mockRejectedValue(new Error('Asaas 422')),
    });

    await expect(
      createBillingForTenant(
        { tenantId: TENANT_ID, nome: 'Tenant A', ownerEmail: 'owner@example.com', cpfCnpj: VALID_CPF, plano: 'starter' },
        provider
      )
    ).rejects.toThrow('Asaas 422');

    expect(state.auditLogInserted).toBe(true);
    expect(state.tenantConfigUpdated).toBe(true);
    expect(provider.criarAssinatura).not.toHaveBeenCalled();
  });

  it('criarAssinatura failure — writes audit_log after customer was created', async () => {
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider({
      criarAssinatura: vi.fn().mockRejectedValue(new Error('Asaas 500')),
    });

    await expect(
      createBillingForTenant(
        { tenantId: TENANT_ID, nome: 'Tenant A', ownerEmail: 'owner@example.com', cpfCnpj: VALID_CPF, plano: 'pro' },
        provider
      )
    ).rejects.toThrow('Asaas 500');

    expect(provider.criarCliente).toHaveBeenCalled();
    expect(state.auditLogInserted).toBe(true);
    expect(state.tenantConfigUpdated).toBe(true);
  });

  it('enterprise plan uses custom valorEnterprise', async () => {
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider();

    await createBillingForTenant(
      {
        tenantId: TENANT_ID,
        nome: 'Big Corp',
        ownerEmail: 'cto@bigcorp.com',
        cpfCnpj: VALID_CPF,
        plano: 'enterprise',
        valorEnterprise: 3500,
      },
      provider
    );

    expect(provider.criarAssinatura).toHaveBeenCalledWith(
      'asaas-customer-123',
      'enterprise',
      3500
    );
  });

  it('enterprise plan without valorEnterprise throws before any Asaas call', async () => {
    const { createBillingForTenant } = await import('../use-cases/create-billing-for-tenant.js');
    const provider = makeProvider();

    await expect(
      createBillingForTenant(
        { tenantId: TENANT_ID, nome: 'Big Corp', ownerEmail: 'cto@bigcorp.com', cpfCnpj: VALID_CPF, plano: 'enterprise' },
        provider
      )
    ).rejects.toThrow('valorEnterprise is required');

    expect(provider.criarCliente).not.toHaveBeenCalled();
  });
});
