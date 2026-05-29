import { describe, expect, it, vi } from 'vitest';

vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'development' as const,
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    BETTER_STACK_TOKEN: 'test_token',
    API_PORT: 3003,
  },
}));

vi.mock('@leedi/observability', () => ({
  runWithContext: vi.fn((ctx: unknown, fn: () => unknown) => fn()),
  getContext: vi.fn(() => ({ request_id: 'test-req-id' })),
  captureException: vi.fn(),
  initSentry: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('GET /health', () => {
  it('returns 200 with status ok and env', async () => {
    const { app } = await import('../app.js');
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; env: string };
    expect(body.status).toBe('ok');
    expect(body.env).toBe('development');
  });
});
