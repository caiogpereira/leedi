import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
vi.mock('@leedi/db', () => ({
  withTenant: vi.fn((_tid: string, fn: (tx: any) => Promise<unknown>) => fn({})),
  schema: { whatsappConnections: {} },
  eq: vi.fn(),
}));

describe('checkConnectionHealth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates row to conectado with fresh data on Meta success', async () => {
    const { checkConnectionHealth } = await import('../use-cases/check-connection-health.js');
    const { withTenant } = await import('@leedi/db');

    const capturedSets: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withTenant).mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  phoneNumberId: 'p1',
                  wabaId: 'w1',
                  accessTokenEncrypted: 'encrypted',
                  accessTokenIv: 'iv',
                  status: 'conectado',
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data: Record<string, unknown>) => {
            capturedSets.push(data);
            return { where: vi.fn() };
          },
        }),
      });
    });

    const fakeProvider = {
      validateConnection: vi.fn().mockResolvedValue({
        displayName: 'Test Shop',
        qualityRating: 'GREEN',
        messagingTier: 'TIER_10K',
      }),
      sendText: vi.fn(),
      sendTemplate: vi.fn(),
      submitTemplate: vi.fn(),
    };

    await checkConnectionHealth({ tenantId: 'tenant-1' }, () => fakeProvider);

    expect(capturedSets.length).toBe(1);
    expect(capturedSets[0]!['status']).toBe('conectado');
    expect(capturedSets[0]!['displayName']).toBe('Test Shop');
    expect(capturedSets[0]!['lastHealthCheckAt']).toBeInstanceOf(Date);
    // Meta's raw GREEN / TIER_10K must be mapped to the DB domain enums.
    expect(capturedSets[0]!['qualityRating']).toBe('verde');
    expect(capturedSets[0]!['messagingTier']).toBe('10k');
  });

  it('sets status to erro on token-expired / auth failure', async () => {
    const { checkConnectionHealth } = await import('../use-cases/check-connection-health.js');
    const { withTenant } = await import('@leedi/db');

    const capturedSets: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withTenant).mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  phoneNumberId: 'p1',
                  wabaId: 'w1',
                  accessTokenEncrypted: 'encrypted',
                  accessTokenIv: 'iv',
                  status: 'conectado',
                },
              ],
            }),
          }),
        }),
        update: () => ({
          set: (data: Record<string, unknown>) => {
            capturedSets.push(data);
            return { where: vi.fn() };
          },
        }),
      });
    });

    const fakeProvider = {
      validateConnection: vi.fn().mockRejectedValue(new Error('Meta API error: 401')),
      sendText: vi.fn(),
      sendTemplate: vi.fn(),
      submitTemplate: vi.fn(),
    };

    await checkConnectionHealth({ tenantId: 'tenant-1' }, () => fakeProvider);

    expect(capturedSets.length).toBe(1);
    expect(capturedSets[0]!['status']).toBe('erro');
    // Should NOT include the token in any logged data
    expect(JSON.stringify(capturedSets[0])).not.toContain('encrypted');
  });

  it('does nothing when no connection exists for tenant', async () => {
    const { checkConnectionHealth } = await import('../use-cases/check-connection-health.js');
    const { withTenant } = await import('@leedi/db');

    let updateCalled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withTenant).mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [], // no connection
            }),
          }),
        }),
        update: () => {
          updateCalled = true;
          return { set: () => ({ where: vi.fn() }) };
        },
      });
    });

    const fakeProvider = {
      validateConnection: vi.fn(),
      sendText: vi.fn(),
      sendTemplate: vi.fn(),
      submitTemplate: vi.fn(),
    };

    await checkConnectionHealth({ tenantId: 'tenant-no-conn' }, () => fakeProvider);

    expect(fakeProvider.validateConnection).not.toHaveBeenCalled();
    expect(updateCalled).toBe(false);
  });
});
