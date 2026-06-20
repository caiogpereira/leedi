import { describe, it, expect, vi } from 'vitest';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'development' as const,
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    BETTER_STACK_TOKEN: 'test_token',
    API_PORT: 3003,
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
    BETTER_AUTH_SECRET: 'supersecretkey_at_least_32_chars_long!!',
    BETTER_AUTH_URL: 'http://localhost:3000',
    DASHBOARD_URL: 'http://localhost:3001',
    RESEND_API_KEY: 'test_resend',
    WORKSPACE_ID: '00000000-0000-0000-0000-000000000001',
    ANTHROPIC_API_KEY: 'test_anthropic',
  },
}));

let existingRow: { webhookUrlPath: string } | undefined;
let insertedValues: unknown;
let updatedSet: unknown;

vi.mock('@leedi/db', () => {
  const tx = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(existingRow ? [existingRow] : []),
        }),
      }),
    }),
    update: () => ({
      set: (v: unknown) => {
        updatedSet = v;
        return {
          where: () => Promise.resolve(undefined),
        };
      },
    }),
    insert: () => ({
      values: (v: unknown) => {
        insertedValues = v;
        return Promise.resolve(undefined);
      },
    }),
  };

  return {
    withTenant: vi.fn((_id: string, fn: (t: typeof tx) => unknown) => fn(tx)),
    schema: {
      gatewayIntegrations: {
        tenantId: 'tenantId',
        webhookUrlPath: 'webhookUrlPath',
      },
    },
    eq: vi.fn((_a: unknown, _b: unknown) => ({})),
  };
});

describe('upsertGatewayHottok', () => {
  it('inserts a new gateway integration with webhookSecret = hottok when none exists', async () => {
    existingRow = undefined;
    insertedValues = undefined;
    updatedSet = undefined;

    const { upsertGatewayHottok } = await import('../upsert-gateway-hottok.js');
    const result = await upsertGatewayHottok({ tenantId: TENANT_ID, hottok: 'real-hottok-123' });

    expect(insertedValues).toMatchObject({
      tenantId: TENANT_ID,
      gateway: 'hotmart',
      webhookSecret: 'real-hottok-123',
      ativo: true,
    });
    expect(updatedSet).toBeUndefined();
    expect(result.webhookUrl).toContain('/webhooks/hotmart/');
  });

  it('updates webhookSecret = hottok on the existing integration without touching gateway', async () => {
    existingRow = { webhookUrlPath: 'existing-path-456' };
    insertedValues = undefined;
    updatedSet = undefined;

    const { upsertGatewayHottok } = await import('../upsert-gateway-hottok.js');
    const result = await upsertGatewayHottok({ tenantId: TENANT_ID, hottok: 'new-hottok-789' });

    expect(updatedSet).toMatchObject({
      webhookSecret: 'new-hottok-789',
      ativo: true,
    });
    // No-clobber: when caller omits `gateway`, the update payload must NOT
    // include a `gateway` key at all — overwriting an existing eduzz/kiwify
    // integration's gateway with the 'hotmart' default would silently
    // corrupt that tenant's integration row.
    expect(updatedSet).not.toHaveProperty('gateway');
    expect(insertedValues).toBeUndefined();
    expect(result.webhookUrl).toContain('existing-path-456');
  });

  it('updates gateway on the existing integration when caller explicitly provides it', async () => {
    existingRow = { webhookUrlPath: 'existing-path-456' };
    insertedValues = undefined;
    updatedSet = undefined;

    const { upsertGatewayHottok } = await import('../upsert-gateway-hottok.js');
    await upsertGatewayHottok({ tenantId: TENANT_ID, hottok: 'new-hottok-789', gateway: 'eduzz' });

    expect(updatedSet).toMatchObject({
      webhookSecret: 'new-hottok-789',
      gateway: 'eduzz',
      ativo: true,
    });
  });
});
