import { Hono } from 'hono';
import { Receiver } from '@upstash/qstash';
import { Redis } from '@upstash/redis';
import { env } from '@leedi/config';
import { withServiceRole, schema, eq } from '@leedi/db';
import { checkConnectionHealth, MetaCloudProvider } from '@leedi/connection';
import type { HealthProviderFactory } from '@leedi/connection';
import { captureException } from '@leedi/observability';

const defaultHealthFactory: HealthProviderFactory = (record) => new MetaCloudProvider(record);

/**
 * Internal routes invoked by Upstash QStash on a schedule.
 * All routes verify the QStash signature before processing.
 */
export function createInternalRouter(
  healthFactory: HealthProviderFactory = defaultHealthFactory
) {
  const router = new Hono();
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });

  async function verifyQStash(c: { req: { header: (name: string) => string | undefined; text: () => Promise<string> } }): Promise<boolean> {
    const signature = c.req.header('upstash-signature') ?? '';
    const body = await c.req.text();
    try {
      await receiver.verify({ signature, body });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * POST /api/internal/whatsapp/health-check-all
   *
   * Called by QStash every 15 minutes. Runs a health check for every
   * active (conectado) WhatsApp connection across all tenants.
   *
   * Setup in Upstash QStash console:
   *   URL:      https://<your-api-domain>/api/internal/whatsapp/health-check-all
   *   Schedule: every 15 min (cron: "* /15 * * * *" — remove the space)
   */
  router.post('/whatsapp/health-check-all', async (c) => {
    if (!(await verifyQStash(c))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Fetch all active connections (bypasses RLS — requires workspace admin context)
    const connections = await withServiceRole(async (tx) =>
      tx
        .select({
          tenantId: schema.whatsappConnections.tenantId,
        })
        .from(schema.whatsappConnections)
        .where(eq(schema.whatsappConnections.status, 'conectado'))
    );

    const results = await Promise.allSettled(
      connections.map((c) =>
        checkConnectionHealth({ tenantId: c.tenantId }, healthFactory)
      )
    );

    const failures = results.filter((r) => r.status === 'rejected');
    for (const f of failures) {
      captureException((f as PromiseRejectedResult).reason);
    }

    return c.json({
      checked: connections.length,
      failed: failures.length,
    });
  });

  /**
   * POST /api/internal/agent-flush
   *
   * Called by QStash with a 6s delay after each inbound message.
   * Flushes the debounce buffer for a lead and enqueues to the agent
   * (agent processing is Epic 7 — buffer is read and cleared here).
   */
  router.post('/agent-flush', async (c) => {
    if (!(await verifyQStash(c))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json() as { tenantId: string; leadPhone: string; bufferKey: string };
    const { tenantId, leadPhone, bufferKey } = body;

    if (!tenantId || !leadPhone || !bufferKey) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });

    // Atomic-ish: LRANGE then DEL — idempotent if buffer already empty
    const buffered = await redis.lrange<string>(bufferKey, 0, -1);
    if (buffered.length > 0) {
      await redis.del(bufferKey);
      // TODO(Epic 7): enqueue buffered messages to agent-process job
      // For now, messages are already persisted by the webhook handler
    }

    return c.json({ flushed: buffered.length });
  });

  return router;
}
