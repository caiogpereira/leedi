import { Hono } from 'hono';
import { z } from 'zod';
import { withTenant, schema, eq } from '@leedi/db';
import {
  connectWhatsappNumber,
  InvalidCredentialsError,
  checkConnectionHealth,
  MetaCloudProvider,
} from '@leedi/connection';
import type { WhatsAppProviderFactory, HealthProviderFactory } from '@leedi/connection';
import { requireTenantSession } from '../middleware/tenant-session.js';

const connectBodySchema = z.object({
  phone_number_id: z.string().min(1, 'phone_number_id é obrigatório'),
  waba_id: z.string().min(1, 'waba_id é obrigatório'),
  access_token: z.string().min(1, 'access_token é obrigatório'),
});

const defaultProviderFactory: WhatsAppProviderFactory = (record) => new MetaCloudProvider(record);
const defaultHealthFactory: HealthProviderFactory = (record) => new MetaCloudProvider(record);

export function createWhatsappRouter(
  providerFactory: WhatsAppProviderFactory = defaultProviderFactory,
  healthFactory: HealthProviderFactory = defaultHealthFactory
) {
  const router = new Hono();

  // GET /api/tenants/:tenantId/whatsapp — returns current connection (token-free)
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          phoneNumberId: schema.whatsappConnections.phoneNumberId,
          wabaId: schema.whatsappConnections.wabaId,
          status: schema.whatsappConnections.status,
          displayName: schema.whatsappConnections.displayName,
          qualityRating: schema.whatsappConnections.qualityRating,
          messagingTier: schema.whatsappConnections.messagingTier,
          lastHealthCheckAt: schema.whatsappConnections.lastHealthCheckAt,
        })
        .from(schema.whatsappConnections)
        .where(eq(schema.whatsappConnections.tenantId, tenantId))
        .limit(1)
    );

    const connection = rows[0] ?? null;
    return c.json({ connection });
  });

  // POST /api/tenants/:tenantId/whatsapp/connect — validate + upsert connection
  router.post('/connect', requireTenantSession('owner'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = connectBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message ?? 'Dados inválidos.';
      return c.json({ error: msg }, 400);
    }

    const { phone_number_id, waba_id, access_token } = parsed.data;
    const tenantId = c.get('resolvedTenantId');

    try {
      const result = await connectWhatsappNumber(
        {
          tenantId,
          phoneNumberId: phone_number_id,
          wabaId: waba_id,
          accessToken: access_token,
        },
        providerFactory
      );

      return c.json(result, 200);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // POST /api/tenants/:tenantId/whatsapp/health-check — on-demand health refresh (owner | operator)
  router.post('/health-check', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    await checkConnectionHealth({ tenantId }, healthFactory);

    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          phoneNumberId: schema.whatsappConnections.phoneNumberId,
          wabaId: schema.whatsappConnections.wabaId,
          status: schema.whatsappConnections.status,
          displayName: schema.whatsappConnections.displayName,
          qualityRating: schema.whatsappConnections.qualityRating,
          messagingTier: schema.whatsappConnections.messagingTier,
          lastHealthCheckAt: schema.whatsappConnections.lastHealthCheckAt,
        })
        .from(schema.whatsappConnections)
        .where(eq(schema.whatsappConnections.tenantId, tenantId))
        .limit(1)
    );

    return c.json({ connection: rows[0] ?? null });
  });

  return router;
}
