import { describe, expect, it, vi } from 'vitest';

// Mock @leedi/config to avoid boot-time process.exit in test environment
vi.mock('@leedi/config', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'test' as const,
    SENTRY_DSN: 'https://test@sentry.io/1',
    POSTHOG_KEY: 'phc_test',
    BETTER_STACK_TOKEN: 'test_token',
    API_PORT: 3003,
  },
}));

describe('@leedi/db exports', () => {
  it('exports schema namespace', async () => {
    const mod = await import('../schema/index.js');
    expect(mod).toBeDefined();
  });

  it('exports drizzle helpers from drizzle-orm', async () => {
    const { eq, sql, and, or } = await import('drizzle-orm');
    expect(typeof eq).toBe('function');
    expect(typeof sql).toBe('function');
    expect(typeof and).toBe('function');
    expect(typeof or).toBe('function');
  });

  it('exports db client', async () => {
    const { db } = await import('../index.js');
    expect(db).toBeDefined();
  });
});
