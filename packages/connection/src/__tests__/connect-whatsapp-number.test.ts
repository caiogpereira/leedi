import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

vi.mock('@leedi/db', () => {
  const upsertFn = vi.fn();
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    withTenant: vi.fn((tenantId: string, fn: (tx: any) => Promise<unknown>) =>
      fn({ insert: () => ({ values: () => ({ onConflictDoUpdate: upsertFn }) }) })
    ),
    schema: {
      whatsappConnections: {},
    },
    eq: vi.fn(),
    sql: vi.fn(),
  };
});

describe('connectWhatsappNumber', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates before persisting — no DB write on invalid credentials', async () => {
    const { connectWhatsappNumber } = await import('../use-cases/connect-whatsapp-number.js');
    const { withTenant } = await import('@leedi/db');

    const fakeProvider = {
      validateConnection: vi.fn().mockRejectedValue(new Error('Meta API error: 400')),
      sendText: vi.fn(),
      sendTemplate: vi.fn(),
    };

    await expect(
      connectWhatsappNumber(
        { tenantId: 't1', phoneNumberId: 'p1', wabaId: 'w1', accessToken: 'bad-token' },
        () => fakeProvider
      )
    ).rejects.toMatchObject({ name: 'InvalidCredentialsError' });

    expect(withTenant).not.toHaveBeenCalled();
  });

  it('encrypts the token before storing — stored token != plaintext', async () => {
    const { connectWhatsappNumber } = await import('../use-cases/connect-whatsapp-number.js');
    const { withTenant } = await import('@leedi/db');

    const capturedArgs: Record<string, unknown>[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withTenant).mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const fakeTx = {
        insert: () => ({
          values: (args: Record<string, unknown>) => {
            capturedArgs.push(args);
            return {
              onConflictDoUpdate: vi.fn(),
            };
          },
        }),
      };
      return fn(fakeTx);
    });

    const plainToken = 'EAABplaintoken';
    const fakeProvider = {
      validateConnection: vi.fn().mockResolvedValue({
        displayName: 'Test Shop',
        qualityRating: 'GREEN',
        messagingTier: 'TIER_1K',
      }),
      sendText: vi.fn(),
      sendTemplate: vi.fn(),
    };

    await connectWhatsappNumber(
      { tenantId: 't1', phoneNumberId: 'p1', wabaId: 'w1', accessToken: plainToken },
      () => fakeProvider
    );

    expect(capturedArgs.length).toBe(1);
    const stored = capturedArgs[0]!;
    expect(stored['accessTokenEncrypted']).not.toBe(plainToken);
    expect(stored['accessTokenEncrypted']).toBeTruthy();
    expect(stored['accessTokenIv']).toBeTruthy();
    expect(JSON.stringify(stored)).not.toContain(plainToken);
  });

  it('returns token-free response on success', async () => {
    const { connectWhatsappNumber } = await import('../use-cases/connect-whatsapp-number.js');
    const { withTenant } = await import('@leedi/db');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(withTenant).mockImplementation(async (_tid: string, fn: (tx: any) => Promise<unknown>) => {
      const fakeTx = {
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: vi.fn(),
          }),
        }),
      };
      return fn(fakeTx);
    });

    const fakeProvider = {
      validateConnection: vi.fn().mockResolvedValue({
        displayName: 'Loja Legal',
        qualityRating: 'GREEN',
        messagingTier: 'TIER_10K',
      }),
      sendText: vi.fn(),
      sendTemplate: vi.fn(),
    };

    const result = await connectWhatsappNumber(
      { tenantId: 't1', phoneNumberId: 'p1', wabaId: 'w1', accessToken: 'secret' },
      () => fakeProvider
    );

    expect(result).toEqual({
      status: 'conectado',
      displayName: 'Loja Legal',
      qualityRating: 'GREEN',
      messagingTier: 'TIER_10K',
      phoneNumberId: 'p1',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
