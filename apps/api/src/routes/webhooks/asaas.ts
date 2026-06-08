import { Hono } from 'hono';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { AsaasProvider } from '@leedi/billing';

function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

function redisClient(): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

function qstashClient(): Client {
  return new Client({ token: env.QSTASH_TOKEN });
}

export function createAsaasWebhookRouter() {
  const router = new Hono();

  router.post('/', async (c) => {
    let payload: Record<string, unknown>;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // Token validation using constant-time comparison (AC: #6)
    const provider = new AsaasProvider(env.ASAAS_API_KEY, env.ASAAS_SANDBOX);
    if (!provider.verificarWebhook(payload, env.ASAAS_WEBHOOK_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payment = payload['payment'] as Record<string, unknown> | undefined;
    const paymentId = payment?.['id'];
    if (typeof paymentId !== 'string') {
      return c.text('OK', 200);
    }

    // Idempotency: Redis SET NX TTL 24h (AC: #7)
    const dedupKey = `webhook:asaas:${paymentId}`;
    const redis = redisClient();
    const set = await redis.set(dedupKey, '1', { nx: true, ex: 86400 });
    if (!set) {
      // Already processed or enqueued
      return c.text('OK', 200);
    }

    // Enqueue to QStash for async processing — return 200 immediately (AC: #1)
    await qstashClient()
      .publishJSON({
        url: `${apiBaseUrl()}/api/internal/billing/process-asaas-event`,
        retries: 5,
        body: payload,
      })
      .catch((err: unknown) => {
        console.error('[asaas-webhook] QStash enqueue failed', err);
      });

    return c.text('OK', 200);
  });

  return router;
}
