import { Hono } from 'hono';
import { db, withTenant, schema, eq, sql } from '@leedi/db';
import { HotmartNormalizer } from '@leedi/gateway';
import { captureException } from '@leedi/observability';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from '../../utils/api-public-url.js';

function qstashClient(): Client {
  return new Client({ token: env.QSTASH_TOKEN });
}

export function createHotmartWebhookRouter() {
  const router = new Hono();

  router.post('/:webhookUrlPath', async (c) => {
    const webhookUrlPath = c.req.param('webhookUrlPath');
    const hottok = c.req.query('hottok');

    // Resolve integration (bypass RLS — no tenant session on public endpoint)
    const integrations = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL row_security = off`);
      return tx
        .select({
          id: schema.gatewayIntegrations.id,
          tenantId: schema.gatewayIntegrations.tenantId,
          webhookSecret: schema.gatewayIntegrations.webhookSecret,
          gateway: schema.gatewayIntegrations.gateway,
          ativo: schema.gatewayIntegrations.ativo,
        })
        .from(schema.gatewayIntegrations)
        .where(eq(schema.gatewayIntegrations.webhookUrlPath, webhookUrlPath))
        .limit(1);
    });

    const integration = integrations[0];
    if (!integration) {
      return c.json({ error: 'Not found' }, 404);
    }

    if (!integration.ativo) {
      return c.text('OK', 200);
    }

    if (!hottok || hottok !== integration.webhookSecret) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const rawBody = await c.req.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400);
    }

    // Fire-and-forget: respond 200 immediately, process async
    processHotmartWebhookAsync(payload, integration.tenantId, integration.gateway).catch(
      captureException
    );

    // 19.3 AC#2: mark onboarding gateway webhook as received when tenant is on step 3
    setGatewayWebhookReceivedIfOnboarding(integration.tenantId).catch(captureException);

    return c.text('OK', 200);
  });

  return router;
}

async function setGatewayWebhookReceivedIfOnboarding(tenantId: string): Promise<void> {
  const rows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ config: schema.tenants.config })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1)
  );

  const config = rows[0]?.config as Record<string, unknown> | undefined;
  const onboardingConfig = config?.['onboarding_config'] as Record<string, unknown> | undefined;

  // Only set the flag when the tenant is actively on step 3 of onboarding
  if (onboardingConfig?.['current_step'] !== 3) return;
  if (onboardingConfig?.['gateway_webhook_received'] === true) return;

  const updated = { ...onboardingConfig, gateway_webhook_received: true };
  await withTenant(tenantId, async (tx) =>
    tx.execute(
      sql`UPDATE "tenants"
          SET "config" = "config" || ${JSON.stringify({ onboarding_config: updated })}::jsonb
          WHERE "id" = ${tenantId}`
    )
  );
}

async function isDuplicate(tenantId: string, dedupId: string): Promise<boolean> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL row_security = off`);
    return tx.execute(
      sql`SELECT id FROM gateway_events
          WHERE tenant_id = ${tenantId}::uuid
          AND (
            payload_original->'data'->'purchase'->>'transaction' = ${dedupId}
            OR payload_original->'data'->>'id' = ${dedupId}
          )
          LIMIT 1`
    );
  });
  return (result as unknown as { rows: unknown[] }).rows.length > 0;
}

async function processHotmartWebhookAsync(
  payload: Record<string, unknown>,
  tenantId: string,
  gateway: string
): Promise<void> {
  const normalized = HotmartNormalizer.normalize(payload);
  const dedupId = normalized.hotmartTransactionId;

  if (dedupId && (await isDuplicate(tenantId, dedupId))) {
    return;
  }

  const inserted = await withTenant(tenantId, async (tx) =>
    tx
      .insert(schema.gatewayEvents)
      .values({
        tenantId,
        gateway,
        eventoCanonical: normalized.eventoCanonical ?? undefined,
        payloadOriginal: payload,
        payloadNormalizado: normalized as unknown as Record<string, unknown>,
        processado: false,
      })
      .returning({ id: schema.gatewayEvents.id })
  );

  const gatewayEventId = inserted[0]?.id;
  if (!gatewayEventId) return;

  if (normalized.eventoCanonical) {
    await qstashClient()
      .publishJSON({
        url: `${apiPublicUrl()}/api/internal/gateway/process-event`,
        body: { gatewayEventId, tenantId },
      })
      .catch(captureException);
  } else {
    console.warn(
      `[gateway] Unknown Hotmart event received — stored with evento_canonico: null. gatewayEventId=${gatewayEventId}`
    );
  }
}
