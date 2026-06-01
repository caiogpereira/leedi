import { describe, expect, it, vi, afterEach } from 'vitest';

const TEST_KEY = Buffer.alloc(32, 0xab).toString('base64');

vi.mock('@leedi/config', () => ({
  env: {
    ENCRYPTION_MASTER_KEY: TEST_KEY,
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

describe('MetaCloudProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validateConnection maps Graph API response to expected shape', async () => {
    const { MetaCloudProvider } = await import('../adapters/meta-cloud-provider.js');
    const { encryptToken } = await import('../adapters/crypto.js');

    const { ciphertext, iv } = encryptToken('EAABtest_access_token');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        verified_name: 'Leedi Test',
        quality_rating: 'GREEN',
        messaging_limit_tier: 'TIER_1K',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new MetaCloudProvider({
      phoneNumberId: '123456789',
      wabaId: 'waba_001',
      accessTokenEncrypted: ciphertext,
      accessTokenIv: iv,
    });

    const result = await provider.validateConnection();

    expect(result).toEqual({
      displayName: 'Leedi Test',
      qualityRating: 'GREEN',
      messagingTier: 'TIER_1K',
    });
  });

  it('validateConnection sends Authorization header with decrypted token', async () => {
    const { MetaCloudProvider } = await import('../adapters/meta-cloud-provider.js');
    const { encryptToken } = await import('../adapters/crypto.js');

    const plainToken = 'EAABsecret_bearer_token';
    const { ciphertext, iv } = encryptToken(plainToken);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        verified_name: 'Test',
        quality_rating: 'GREEN',
        messaging_limit_tier: 'TIER_10K',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new MetaCloudProvider({
      phoneNumberId: '999',
      wabaId: 'waba_002',
      accessTokenEncrypted: ciphertext,
      accessTokenIv: iv,
    });

    await provider.validateConnection();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${plainToken}`);
  });

  it('decrypted token never appears in JSON serialization of provider', async () => {
    const { MetaCloudProvider } = await import('../adapters/meta-cloud-provider.js');
    const { encryptToken } = await import('../adapters/crypto.js');

    const plainToken = 'EAABsupersecret';
    const { ciphertext, iv } = encryptToken(plainToken);

    const provider = new MetaCloudProvider({
      phoneNumberId: '1',
      wabaId: 'w',
      accessTokenEncrypted: ciphertext,
      accessTokenIv: iv,
    });

    const serialized = JSON.stringify(provider);
    expect(serialized).not.toContain(plainToken);
  });

  it('sendText and sendTemplate compile and satisfy the interface', async () => {
    const { MetaCloudProvider } = await import('../adapters/meta-cloud-provider.js');
    const { encryptToken } = await import('../adapters/crypto.js');
    const { ciphertext, iv } = encryptToken('token');

    const provider = new MetaCloudProvider({
      phoneNumberId: '1',
      wabaId: 'w',
      accessTokenEncrypted: ciphertext,
      accessTokenIv: iv,
    });

    expect(typeof provider.sendText).toBe('function');
    expect(typeof provider.sendTemplate).toBe('function');
    expect(typeof provider.validateConnection).toBe('function');
  });
});
