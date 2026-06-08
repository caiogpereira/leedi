import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@leedi/config';
import type { Context, Next } from 'hono';

// NFR8: per-tenant API rate limiting. Sliding window keyed by tenant for normal
// routes; a higher window keyed by connection for webhook bursts (Meta/Hotmart).

/** Minimal surface a limiter must satisfy — lets tests inject a fake. */
export interface RateLimiter {
  limit: (identifier: string) => Promise<{ success: boolean }>;
}

function makeRedis(): Redis {
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

let tenantLimiter: Ratelimit | undefined;
let webhookLimiter: Ratelimit | undefined;

function getTenantLimiter(): Ratelimit {
  tenantLimiter ??= new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    prefix: 'rl:tenant',
  });
  return tenantLimiter;
}

function getWebhookLimiter(): Ratelimit {
  webhookLimiter ??= new Ratelimit({
    redis: makeRedis(),
    limiter: Ratelimit.slidingWindow(1000, '1 m'),
    prefix: 'rl:webhook',
  });
  return webhookLimiter;
}

/**
 * The real limiter makes live Upstash HTTP calls on every guarded route, which
 * would hang test suites that mock @leedi/config with a placeholder Upstash host.
 * We short-circuit (allow) when NOT given an injected limiter AND the environment
 * is non-production with a test/placeholder Upstash URL. Production (and any test
 * that injects a fake limiter) runs the real path.
 */
function isDisabled(injected: RateLimiter | undefined): boolean {
  if (injected !== undefined) return false;
  if (env.NODE_ENV === 'production') return false;
  // Disable for the well-known test placeholder host (used by route unit tests).
  return env.UPSTASH_REDIS_REST_URL.includes('test.upstash.io');
}

/** Fail open: a limiter/network error must never block or 500 a request. */
async function safeLimit(limiter: RateLimiter, key: string): Promise<{ success: boolean }> {
  try {
    return await limiter.limit(key);
  } catch {
    return { success: true };
  }
}

/**
 * Per-tenant sliding-window rate limit (100 req/min). Keys off the `:tenantId`
 * path param (falling back to `resolvedTenantId` if a session was already
 * resolved), so it works as a router-level `router.use('*', rateLimitTenant())`
 * regardless of where requireTenantSession runs. Pass a limiter to inject a fake
 * in tests.
 */
export function rateLimitTenant(injected?: RateLimiter) {
  return async (c: Context, next: Next) => {
    if (isDisabled(injected)) return next();
    const tenantId = c.req.param('tenantId') ?? c.get('resolvedTenantId');
    if (!tenantId) {
      // No tenant in scope — fail open rather than block (auth will reject anyway).
      return next();
    }
    const limiter: RateLimiter = injected ?? getTenantLimiter();
    const { success } = await safeLimit(limiter, `tenant:${tenantId}`);
    if (!success) {
      return c.json({ error: 'Rate limit exceeded. Try again in a moment.' }, 429);
    }
    return next();
  };
}

/**
 * Higher-limit sliding window (1000 req/min) for webhook endpoints, keyed by
 * connection id. Bursts from Meta/Hotmart are normal.
 */
export function rateLimitWebhook(
  getConnectionId: (c: Context) => string | undefined,
  injected?: RateLimiter
) {
  return async (c: Context, next: Next) => {
    if (isDisabled(injected)) return next();
    const connectionId = getConnectionId(c) ?? 'unknown';
    const limiter: RateLimiter = injected ?? getWebhookLimiter();
    const { success } = await safeLimit(limiter, `webhook:${connectionId}`);
    if (!success) {
      return c.json({ error: 'Rate limit exceeded.' }, 429);
    }
    return next();
  };
}

/**
 * Inline webhook rate-limit check (1000/min) for endpoints that must read the
 * raw body once (Meta signature verification) and therefore can't run the
 * limiter as upstream middleware. Returns `true` when the request is allowed.
 * Short-circuits to allowed under NODE_ENV=test unless a limiter is injected.
 */
export async function webhookLimit(
  key: string,
  injected?: RateLimiter
): Promise<{ success: boolean }> {
  if (isDisabled(injected)) return { success: true };
  const limiter: RateLimiter = injected ?? getWebhookLimiter();
  return safeLimit(limiter, `webhook:${key}`);
}
