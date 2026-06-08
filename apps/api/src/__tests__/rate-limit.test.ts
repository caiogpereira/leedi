import { describe, expect, it, vi } from 'vitest';

// Mock @leedi/config so importing the middleware doesn't validate real env.
// NODE_ENV='development' + the test Upstash host would normally short-circuit the
// limiter, but every test here INJECTS a fake limiter, which forces the real path.
vi.mock('@leedi/config', () => ({
  env: {
    NODE_ENV: 'development' as const,
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test_token',
  },
}));

import { Hono } from 'hono';
import { rateLimitTenant, rateLimitWebhook, webhookLimit, type RateLimiter } from '../middleware/rate-limit.js';

function fakeLimiter(success: boolean): RateLimiter {
  return { limit: vi.fn(async () => ({ success })) };
}

describe('rateLimitTenant', () => {
  it('allows the request and keys off :tenantId when under the limit', async () => {
    const limiter = fakeLimiter(true);
    const app = new Hono();
    app.use('/api/tenants/:tenantId/*', rateLimitTenant(limiter));
    app.get('/api/tenants/:tenantId/x', (c) => c.text('ok'));

    const res = await app.request('/api/tenants/t-123/x');
    expect(res.status).toBe(200);
    expect(limiter.limit).toHaveBeenCalledWith('tenant:t-123');
  });

  it('returns 429 when the limit is exceeded', async () => {
    const app = new Hono();
    app.use('/api/tenants/:tenantId/*', rateLimitTenant(fakeLimiter(false)));
    app.get('/api/tenants/:tenantId/x', (c) => c.text('ok'));

    const res = await app.request('/api/tenants/t-1/x');
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Try again in a moment.' });
  });

  it('fails open (allows) when the limiter throws', async () => {
    const throwing: RateLimiter = {
      limit: vi.fn(async () => {
        throw new Error('upstash down');
      }),
    };
    const app = new Hono();
    app.use('/api/tenants/:tenantId/*', rateLimitTenant(throwing));
    app.get('/api/tenants/:tenantId/x', (c) => c.text('ok'));

    const res = await app.request('/api/tenants/t-1/x');
    expect(res.status).toBe(200);
  });
});

describe('rateLimitWebhook', () => {
  it('returns 429 when exceeded, keyed by connection id', async () => {
    const limiter = fakeLimiter(false);
    const app = new Hono();
    app.use('/wh', rateLimitWebhook(() => 'conn-9', limiter));
    app.post('/wh', (c) => c.text('ok'));

    const res = await app.request('/wh', { method: 'POST' });
    expect(res.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith('webhook:conn-9');
  });
});

describe('webhookLimit (inline)', () => {
  it('returns success from the injected limiter', async () => {
    const out = await webhookLimit('pn-1', fakeLimiter(false));
    expect(out.success).toBe(false);
  });

  it('fails open when the limiter throws', async () => {
    const out = await webhookLimit('pn-1', {
      limit: async () => {
        throw new Error('boom');
      },
    });
    expect(out.success).toBe(true);
  });
});
