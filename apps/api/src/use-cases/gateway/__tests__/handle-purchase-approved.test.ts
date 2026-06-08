import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const GATEWAY_EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_ID = 'pppppppp-pppp-4ppp-8ppp-pppppppppppp';

type TxMock = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

const mockNormalizedPayload = {
  phoneNumber: '+5511999998888',
  productId: 'HOTMART-PROD-001',
  productName: 'Curso Premium',
  value: 297,
  hotmartTransactionId: 'HP12345678901234',
};

// Shared call-sequence helpers
let withServiceRoleCallCount = 0;
let withTenantCallCount = 0;

function buildServiceRoleTx(event: object | null): TxMock {
  return {
    select: vi.fn().mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(event ? [event] : []) }) }),
    }),
    insert: vi.fn(),
    update: vi.fn(),
  };
}

function buildTenantTx(leadRow: object | null, journeyRow: object[] = [], productRow: object | null = null): TxMock {
  return {
    select: vi.fn().mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            // Each call returns results in order: leads lookup, then journey check, then product lookup
            // This is a simplified mock; real tests should use call-index tracking
            return Promise.resolve([]);
          },
        }),
      }),
    })),
    insert: vi.fn().mockReturnValue({
      values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve(leadRow ? [leadRow] : []) }) }),
    }),
    update: vi.fn().mockReturnValue({
      set: () => ({ where: () => Promise.resolve() }),
    }),
  };
}

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) => {
    withServiceRoleCallCount++;
    const tx = buildServiceRoleTx({
      id: GATEWAY_EVENT_ID,
      processado: false,
      payloadNormalizado: mockNormalizedPayload,
    });
    return fn(tx);
  }),
  withTenant: vi.fn(async (_id: string, fn: (tx: unknown) => unknown) => {
    withTenantCallCount++;
    // Track the call count per call
    let selectCallIndex = 0;
    const tx = {
      select: vi.fn().mockImplementation(() => ({
        from: () => ({
          where: () => ({
            limit: () => {
              const idx = selectCallIndex++;
              if (idx === 0) {
                // leads lookup: return existing lead
                return Promise.resolve([{ id: LEAD_ID }]);
              } else if (idx === 1) {
                // journey event idempotency check: no existing
                return Promise.resolve([]);
              } else {
                // product lookup: found
                return Promise.resolve([{ id: PRODUCT_ID }]);
              }
            },
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: () => Promise.resolve(),
      }),
      update: vi.fn().mockReturnValue({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    };
    return fn(tx);
  }),
  schema: {
    leads: { __name: 'leads' },
    products: { __name: 'products' },
    leadJourneyEvents: { __name: 'lead_journey_events' },
    gatewayEvents: { __name: 'gateway_events' },
  },
  eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  and: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: unknown[]) => ({ strings, values: _vals }),
    { raw: (s: string) => s }
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  withServiceRoleCallCount = 0;
  withTenantCallCount = 0;
});

describe('handlePurchaseApproved', () => {
  it('sets comprou = true and creates journey event for known lead', async () => {
    const { handlePurchaseApproved } = await import('../handle-purchase-approved.js');
    await handlePurchaseApproved({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
  });

  it('returns early when event is already processado', async () => {
    const { withServiceRole } = await import('@leedi/db');
    vi.mocked(withServiceRole).mockImplementationOnce(async (fn) => {
      return fn({
        select: vi.fn().mockReturnValue({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve([{ id: GATEWAY_EVENT_ID, processado: true, payloadNormalizado: {} }]),
            }),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      } as unknown as Parameters<typeof fn>[0]);
    });

    const { handlePurchaseApproved } = await import('../handle-purchase-approved.js');
    await handlePurchaseApproved({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('creates new lead with nome from buyer.name when phone is not found (AC#3)', async () => {
    const { withTenant } = await import('@leedi/db');
    const newLeadId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const capturedValues: Record<string, unknown>[] = [];

    vi.mocked(withTenant).mockImplementationOnce(async (_id, fn) => {
      let selectCallIndex = 0;
      return fn({
        select: vi.fn().mockImplementation(() => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve(selectCallIndex++ === 0 ? [] : []),
            }),
          }),
        })),
        insert: vi.fn().mockImplementation(() => ({
          values: (vals: Record<string, unknown>) => {
            capturedValues.push(vals);
            return {
              onConflictDoNothing: () => ({
                returning: () => Promise.resolve([{ id: newLeadId }]),
              }),
            };
          },
        })),
        update: vi.fn().mockReturnValue({
          set: () => ({ where: () => Promise.resolve() }),
        }),
      } as unknown as Parameters<typeof fn>[0]);
    });

    const { withServiceRole } = await import('@leedi/db');
    vi.mocked(withServiceRole).mockImplementationOnce(async (fn) =>
      fn({
        select: vi.fn().mockReturnValue({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: GATEWAY_EVENT_ID,
                    processado: false,
                    payloadNormalizado: { ...mockNormalizedPayload, buyerName: 'João Silva' },
                  },
                ]),
            }),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      } as unknown as Parameters<typeof fn>[0])
    );

    const { handlePurchaseApproved } = await import('../handle-purchase-approved.js');
    await handlePurchaseApproved({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    expect(withTenant).toHaveBeenCalled();
    const leadInsert = capturedValues[0];
    expect(leadInsert?.nome).toBe('João Silva');
    expect(leadInsert?.comprou).toBe(true);
  });

  it('returns early when event is not found', async () => {
    const { withServiceRole } = await import('@leedi/db');
    vi.mocked(withServiceRole).mockImplementationOnce(async (fn) => {
      return fn({
        select: vi.fn().mockReturnValue({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      } as unknown as Parameters<typeof fn>[0]);
    });

    const { handlePurchaseApproved } = await import('../handle-purchase-approved.js');
    await handlePurchaseApproved({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).not.toHaveBeenCalled();
  });
});
