import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { Receiver } from '@upstash/qstash';
import { Redis } from '@upstash/redis';
import { env } from '@leedi/config';
import { withServiceRole, withTenant, schema, eq, and, gte, sql } from '@leedi/db';
import { incrementUsage } from '@leedi/usage';
import { checkConnectionHealth, MetaCloudProvider } from '@leedi/connection';
import type { HealthProviderFactory } from '@leedi/connection';
import { processCampaignPhaseTransition } from '../jobs/campaign-phase-transition.js';
import type { CampaignPhaseTransitionPayload } from '../jobs/campaign-phase-transition.js';
import { processGatewayEvent } from '../jobs/process-gateway-event.js';
import type { ProcessGatewayEventPayload } from '../jobs/process-gateway-event.js';
import { runDispatchJob } from '../jobs/run-dispatch-job.js';
import type { RunDispatchJobPayload } from '../jobs/run-dispatch-job.js';
import { processDispatchBatch } from '../jobs/process-dispatch-batch.js';
import type { ProcessDispatchBatchPayload } from '../jobs/process-dispatch-batch.js';
import { dispatchRecoveryTarget } from '../jobs/dispatch-recovery-target.js';
import type { DispatchRecoveryTargetPayload } from '../jobs/dispatch-recovery-target.js';
import { sendFollowup } from '../jobs/send-followup.js';
import type { SendFollowupPayload } from '../jobs/send-followup.js';
import { processMessage } from '@leedi/agent';
import type { RedisLock } from '@leedi/agent';
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
   * Called by QStash with a 6s delay after each inbound message. Flushes the
   * debounce buffer for a lead and runs the agent loop (Story 7.2).
   *
   * The Meta webhook already acked 200 and resolved the lead/window, so the
   * agent loop runs here — never blocking the webhook ack. QStash retries on a
   * non-2xx response; the buffer DEL + the distributed lock are the idempotency
   * guards (the buffer is drained BEFORE processing so a retry re-acquires the
   * lock but finds nothing to process).
   */
  router.post('/agent-flush', async (c) => {
    if (!(await verifyQStash(c))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = (await c.req.json()) as {
      tenantId: string;
      leadPhone: string;
      bufferKey: string;
      leadId?: string;
      connectionId?: string;
      conversationWindowId?: string;
    };
    const { tenantId, leadPhone, bufferKey, leadId, connectionId, conversationWindowId } = body;

    if (!tenantId || !leadPhone || !bufferKey) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });

    // Drain the debounce buffer (idempotent: empty on a retry).
    const buffered = await redis.lrange<string>(bufferKey, 0, -1);
    if (buffered.length === 0) {
      return c.json({ flushed: 0 });
    }
    await redis.del(bufferKey);

    // Parse each buffered message (Story 7.7: media refs ride along with content).
    interface BufferedMessage {
      content?: string;
      tipo?: 'texto' | 'audio' | 'imagem' | 'documento' | 'template' | 'sticker';
      mediaId?: string;
      mimeType?: string;
      inboundMessageId?: string;
    }
    const parsed: BufferedMessage[] = buffered.map((raw) => {
      try {
        return JSON.parse(raw) as BufferedMessage;
      } catch {
        return {};
      }
    });

    // Join text content into a single user turn for the agent.
    const userText = parsed
      .map((m) => m.content ?? '')
      .filter((s) => s.length > 0)
      .join('\n');

    // Media turn: voice notes / photos arrive as their own message. Pick the LAST
    // media-bearing buffered message so the agent loop can download + transcribe
    // (audio) or build the vision block (image) for the correct inbound row.
    const mediaMsg = [...parsed]
      .reverse()
      .find((m) => (m.tipo === 'audio' || m.tipo === 'imagem') && !!m.mediaId);

    // Identity/transport fields come from the webhook (no window re-resolution).
    // Text path requires non-empty userText; a media-only turn (audio with no
    // caption) is still actionable.
    if (!leadId || !connectionId || !conversationWindowId || (userText.length === 0 && !mediaMsg)) {
      // Buffer is drained; nothing actionable to process (older/partial payload).
      return c.json({ flushed: buffered.length, processed: false });
    }

    const agentStartedAt = new Date();
    const result = await processMessage(
      {
        tenantId,
        connectionId,
        leadId,
        leadPhone,
        conversationWindowId,
        userText,
        ...(mediaMsg
          ? {
              tipo: mediaMsg.tipo,
              mediaId: mediaMsg.mediaId,
              mimeType: mediaMsg.mimeType,
              inboundMessageId: mediaMsg.inboundMessageId,
            }
          : {}),
      },
      {
        redis: redis as unknown as RedisLock,
        anthropic: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
        logError: (error) => captureException(error),
      }
    ).catch((err) => {
      captureException(err);
      throw err; // surface as 5xx so QStash retries
    });

    // 16.1 AC#5: accumulate AI cost after agent loop completes (non-blocking).
    if (result.status === 'sent' && conversationWindowId) {
      trackAiCost(tenantId, conversationWindowId, agentStartedAt).catch(() => {});
    }

    return c.json({ flushed: buffered.length, processed: true, status: result.status });
  });

  /**
   * POST /api/internal/campaign-phase-transition
   *
   * Called by QStash at the admin-configured transition date. Advances the
   * campaign phase automatically (e.g., carrinho_aberto → downsell).
   * Gracefully skips if the campaign is no longer active when the job fires.
   */
  router.post('/campaign-phase-transition', async (c) => {
    if (!(await verifyQStash(c))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = (await c.req.json()) as CampaignPhaseTransitionPayload;
    if (!body.tenantId || !body.campaignId || !body.targetPhase) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const result = await processCampaignPhaseTransition(body).catch((err) => {
      captureException(err);
      throw err;
    });

    return c.json(result);
  });

  /**
   * POST /api/internal/gateway/process-event
   *
   * Called by QStash after Hotmart webhook insertion. Dispatches to the
   * appropriate handler based on evento_canonico.
   */
  router.post('/gateway/process-event', async (c) => {
    if (!(await verifyQStash(c))) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = (await c.req.json()) as ProcessGatewayEventPayload;
    if (!body.gatewayEventId || !body.tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const result = await processGatewayEvent(body).catch((err) => {
      captureException(err);
      throw err;
    });

    return c.json(result);
  });

  /**
   * POST /api/internal/dispatch/run-job
   *
   * Fired by QStash at a dispatch job's scheduled time. Materialises the target
   * list and kicks off the first send batch (Story 13.2).
   */
  router.post('/dispatch/run-job', async (c) => {
    if (!(await verifyQStash(c))) return c.json({ error: 'Unauthorized' }, 401);
    const body = (await c.req.json()) as RunDispatchJobPayload;
    if (!body.dispatchJobId || !body.tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    const result = await runDispatchJob(body).catch((err) => {
      captureException(err);
      throw err;
    });
    return c.json(result);
  });

  /**
   * POST /api/internal/dispatch/process-batch
   *
   * Self-chaining QStash job that sends one throttled batch of templates and
   * schedules the next batch (Story 13.2).
   */
  router.post('/dispatch/process-batch', async (c) => {
    if (!(await verifyQStash(c))) return c.json({ error: 'Unauthorized' }, 401);
    const body = (await c.req.json()) as ProcessDispatchBatchPayload;
    if (!body.dispatchJobId || !body.tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    const result = await processDispatchBatch(body).catch((err) => {
      captureException(err);
      throw err;
    });
    return c.json(result);
  });

  /**
   * POST /api/internal/gateway/dispatch-recovery-target
   *
   * Fired by handle-recovery-event after a recovery-trigger gateway event. Sends
   * the rule's template to the lead (with dedup + quality gate) (Story 13.3).
   */
  router.post('/gateway/dispatch-recovery-target', async (c) => {
    if (!(await verifyQStash(c))) return c.json({ error: 'Unauthorized' }, 401);
    const body = (await c.req.json()) as DispatchRecoveryTargetPayload;
    if (!body.leadId || !body.dispatchRuleId || !body.tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    const result = await dispatchRecoveryTarget(body).catch((err) => {
      captureException(err);
      throw err;
    });
    return c.json(result);
  });

  /**
   * POST /api/internal/dispatch/send-followup
   *
   * Fired by QStash at a scheduled follow-up time. Sends a free-text follow-up if
   * the 24h window is still open, else marks it janela_fechada (Story 13.4).
   */
  router.post('/dispatch/send-followup', async (c) => {
    if (!(await verifyQStash(c))) return c.json({ error: 'Unauthorized' }, 401);
    const body = (await c.req.json()) as SendFollowupPayload;
    if (!body.followupId || !body.tenantId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    const result = await sendFollowup(body).catch((err) => {
      captureException(err);
      throw err;
    });
    return c.json(result);
  });

  return router;
}

/**
 * 16.1 AC#5: sum custo_usd from agent_messages created during this agent call and
 * accumulate into usage_counters.custo_ia_usd.
 * Runs fire-and-forget after the agent response is sent — never blocks message delivery.
 */
async function trackAiCost(
  tenantId: string,
  conversationWindowId: string,
  since: Date
): Promise<void> {
  try {
    // Step 1: find the thread for this conversation window.
    const [threadRow] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ id: schema.agentThreads.id })
        .from(schema.agentThreads)
        .where(
          and(
            eq(schema.agentThreads.tenantId, tenantId),
            eq(schema.agentThreads.conversationWindowId, conversationWindowId)
          )
        )
        .limit(1)
    );

    if (!threadRow) return;

    // Step 2: sum AI cost for messages created since the agent loop started.
    const [costRow] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ totalCost: sql<string>`COALESCE(SUM(${schema.agentMessages.custoUsd}), '0')` })
        .from(schema.agentMessages)
        .where(
          and(
            eq(schema.agentMessages.tenantId, tenantId),
            eq(schema.agentMessages.threadId, threadRow.id),
            gte(schema.agentMessages.createdAt, since)
          )
        )
    );

    const totalCost = parseFloat(costRow?.totalCost ?? '0');
    if (totalCost > 0) {
      await incrementUsage({ tenantId, billable: false, aiCostUsd: totalCost });
    }
  } catch {
    // Non-critical: cost tracking failure must not affect message delivery.
  }
}
