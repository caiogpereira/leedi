import { Hono } from 'hono';
import { Redis } from '@upstash/redis';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from '../../utils/api-public-url.js';
import { AsaasProvider } from '@leedi/billing';

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

    // Token validation (AC: #6). Asaas sends the auth token in the
    // `asaas-access-token` HTTP header (NOT the JSON body — see Asaas webhook docs).
    // Constant-time comparison guards against timing-based token enumeration.
    const incomingToken = c.req.header('asaas-access-token');
    const provider = new AsaasProvider(env.ASAAS_API_KEY, env.ASAAS_SANDBOX);
    if (!provider.verificarWebhook(incomingToken, env.ASAAS_WEBHOOK_TOKEN)) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const payment = payload['payment'] as Record<string, unknown> | undefined;
    const paymentId = payment?.['id'];
    if (typeof paymentId !== 'string') {
      return c.text('OK', 200);
    }

    // Idempotency optimization: Redis SET NX TTL 24h (AC: #7). This only avoids
    // re-enqueuing concurrent duplicates — the durable idempotency guard is the
    // UNIQUE index on invoices.asaas_payment_id enforced in processBillingEvent.
    const dedupKey = `webhook:asaas:${paymentId}`;
    const redis = redisClient();
    const set = await redis.set(dedupKey, '1', { nx: true, ex: 86400 });
    if (!set) {
      // Already processed or enqueued
      return c.text('OK', 200);
    }

    // Enqueue to QStash for async processing — return 200 immediately (AC: #1).
    // CRITICAL (money flow): if the enqueue fails we must NOT swallow it. Releasing
    // the dedup key and returning 500 makes Asaas retry the webhook — otherwise the
    // dedup key would block reprocessing for 24h and the payment event is lost.
    try {
      await qstashClient().publishJSON({
        url: `${apiPublicUrl()}/api/internal/billing/process-asaas-event`,
        retries: 5,
        body: payload,
      });
    } catch (err) {
      console.error('[asaas-webhook] QStash enqueue failed', err);
      await redis.del(dedupKey).catch(() => {});
      return c.json({ error: 'Enqueue failed' }, 500);
    }

    return c.text('OK', 200);
  });

  return router;
}
