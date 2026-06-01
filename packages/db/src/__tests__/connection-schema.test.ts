import { describe, expect, it, vi } from 'vitest';

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'test' as const,
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    BETTER_STACK_TOKEN: 'test_token',
    API_PORT: 3003,
    BETTER_AUTH_SECRET: 'test-secret-32-chars-minimum-len',
    BETTER_AUTH_URL: 'http://localhost:3003',
    DASHBOARD_URL: 'http://localhost:3001',
    RESEND_API_KEY: 're_test',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
    WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
    ANTHROPIC_API_KEY: 'sk-test',
    ENCRYPTION_MASTER_KEY: Buffer.alloc(32).toString('base64'),
    WHATSAPP_API_VERSION: 'v20.0',
  },
}));

describe('whatsapp_connections schema', () => {
  it('exports whatsappConnections table', async () => {
    const { whatsappConnections } = await import('../schema/connection.js');
    expect(whatsappConnections).toBeDefined();
  });

  it('has all required columns', async () => {
    const { whatsappConnections } = await import('../schema/connection.js');
    const cols = Object.keys(whatsappConnections);
    const required = [
      'id',
      'tenantId',
      'phoneNumberId',
      'wabaId',
      'accessTokenEncrypted',
      'accessTokenIv',
      'status',
      'qualityRating',
      'messagingTier',
      'displayName',
      'lastHealthCheckAt',
      'createdAt',
      'updatedAt',
    ];
    for (const col of required) {
      expect(cols, `missing column: ${col}`).toContain(col);
    }
  });

  it('re-exports from schema index', async () => {
    const schemaIndex = await import('../schema/index.js');
    expect(schemaIndex.whatsappConnections).toBeDefined();
    expect(schemaIndex.whatsappConnectionStatusEnum).toBeDefined();
  });
});
