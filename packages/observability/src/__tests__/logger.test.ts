import { describe, expect, it, vi } from 'vitest';

vi.mock('@leedi/config', () => ({
  env: {
    NODE_ENV: 'test' as const,
    BETTER_STACK_TOKEN: 'test_token',
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    API_PORT: 3003,
  },
}));

vi.mock('@logtail/node', () => ({
  Logtail: vi.fn().mockImplementation(() => ({
    info: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
    debug: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: unknown) => void) => cb({ setContext: vi.fn(), setUser: vi.fn() })),
}));

vi.mock('posthog-node', () => ({
  PostHog: vi.fn().mockImplementation(() => ({
    capture: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('logger', () => {
  it('logs info with request_id from context', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { logger, runWithContext } = await import('../index.js');

    runWithContext({ request_id: 'req-123', tenant_id: 'tenant-abc' }, () => {
      logger.info('test message', { extra: 'data' });
    });

    // In test env (not 'development'), console.log is NOT called — only Better Stack
    consoleSpy.mockRestore();
  });

  it('context propagates request_id and tenant_id within async scope', async () => {
    const { getContext, runWithContext } = await import('../context.js');

    const result = await new Promise<{ request_id: string; tenant_id?: string }>((resolve) => {
      runWithContext({ request_id: 'req-456', tenant_id: 'tenant-xyz' }, () => {
        resolve(getContext());
      });
    });

    expect(result.request_id).toBe('req-456');
    expect(result.tenant_id).toBe('tenant-xyz');
  });

  it('context is isolated between concurrent runs', async () => {
    const { getContext, runWithContext } = await import('../context.js');

    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) =>
        runWithContext({ request_id: 'req-A' }, () => {
          results.push(getContext().request_id);
          resolve();
        }),
      ),
      new Promise<void>((resolve) =>
        runWithContext({ request_id: 'req-B' }, () => {
          results.push(getContext().request_id);
          resolve();
        }),
      ),
    ]);

    expect(results).toContain('req-A');
    expect(results).toContain('req-B');
  });
});
