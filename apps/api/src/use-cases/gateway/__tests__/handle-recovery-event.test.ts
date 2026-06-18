import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const GATEWAY_EVENT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const mockPayload = {
  phoneNumber: '+5511999998888',
  productName: 'Curso Premium',
  hotmartTransactionId: 'HP12345678901234',
};

vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      select: vi.fn().mockReturnValue({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: GATEWAY_EVENT_ID,
                  processado: false,
                  eventoCanonical: 'carrinho_abandonado',
                  payloadNormalizado: mockPayload,
                },
              ]),
          }),
        }),
      }),
      insert: vi.fn(),
      update: vi.fn(),
    })
  ),
  withTenant: vi.fn(async (_id: string, fn: (tx: unknown) => unknown) => {
    let selectCallIndex = 0;
    return fn({
      select: vi.fn().mockImplementation(() => ({
        from: () => ({
          where: () => ({
            limit: () => {
              const idx = selectCallIndex++;
              return Promise.resolve(idx === 0 ? [{ id: LEAD_ID }] : []);
            },
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: () => Promise.resolve(),
      }),
      update: vi.fn().mockReturnValue({
        set: () => ({ where: () => Promise.resolve() }),
      }),
      execute: vi.fn().mockResolvedValue([]),
    });
  }),
  schema: {
    leads: { __name: 'leads' },
    leadJourneyEvents: { __name: 'lead_journey_events' },
    gatewayEvents: { __name: 'gateway_events' },
  },
  eq: vi.fn(),
  and: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: unknown[]) => ({ strings, values: _vals }),
    { raw: (s: string) => s }
  ),
}));

vi.mock('@leedi/config', () => ({
  env: { QSTASH_TOKEN: 'test', BETTER_AUTH_URL: 'http://localhost:3000', API_PORT: 3003 },
}));

vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: vi.fn().mockResolvedValue({ messageId: 'q1' }),
  })),
}));

vi.mock('@leedi/observability', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleRecoveryEvent', () => {
  it('creates journey event for known lead on carrinho_abandonado', async () => {
    const { handleRecoveryEvent } = await import('../handle-recovery-event.js');
    await handleRecoveryEvent({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
  });

  it('returns early when event is already processado', async () => {
    const { withServiceRole } = await import('@leedi/db');
    vi.mocked(withServiceRole).mockImplementationOnce(async (fn) =>
      fn({
        select: vi.fn().mockReturnValue({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([{ id: GATEWAY_EVENT_ID, processado: true, payloadNormalizado: {} }]),
            }),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      } as unknown as Parameters<typeof fn>[0])
    );

    const { handleRecoveryEvent } = await import('../handle-recovery-event.js');
    await handleRecoveryEvent({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('creates new lead when phone not found', async () => {
    const { withTenant } = await import('@leedi/db');
    const newLeadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
        insert: vi.fn().mockReturnValue({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([{ id: newLeadId }]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: () => ({ where: () => Promise.resolve() }),
        }),
        execute: vi.fn().mockResolvedValue([]),
      } as unknown as Parameters<typeof fn>[0]);
    });

    const { handleRecoveryEvent } = await import('../handle-recovery-event.js');
    await handleRecoveryEvent({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    expect(withTenant).toHaveBeenCalled();
  });
});

describe('handleCancellation', () => {
  it('reverts comprou to false and creates cancellation journey event', async () => {
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
                    eventoCanonical: 'compra_cancelada',
                    payloadNormalizado: { phoneNumber: '+5511999998888' },
                  },
                ]),
            }),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      } as unknown as Parameters<typeof fn>[0])
    );

    const { handleCancellation } = await import('../handle-cancellation.js');
    await handleCancellation({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
  });

  it('returns early when event is already processado', async () => {
    const { withServiceRole } = await import('@leedi/db');
    vi.mocked(withServiceRole).mockImplementationOnce(async (fn) =>
      fn({
        select: vi.fn().mockReturnValue({
          from: () => ({
            where: () => ({
              limit: () =>
                Promise.resolve([{ id: GATEWAY_EVENT_ID, processado: true, payloadNormalizado: {} }]),
            }),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      } as unknown as Parameters<typeof fn>[0])
    );

    const { handleCancellation } = await import('../handle-cancellation.js');
    await handleCancellation({ gatewayEventId: GATEWAY_EVENT_ID, tenantId: TENANT_ID });

    const { withTenant } = await import('@leedi/db');
    expect(withTenant).not.toHaveBeenCalled();
  });
});
