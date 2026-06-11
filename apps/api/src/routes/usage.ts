import { Hono } from 'hono';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { requirePermission } from '../middleware/require-role.js';
import { rateLimitTenant } from '../middleware/rate-limit.js';
import { getUsageCounter, getUsageHistory } from '@leedi/usage';
import { withTenant, schema, eq, sql } from '@leedi/db';

export function createUsageRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/usage/current
  router.get('/current', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    try {
      const counter = await getUsageCounter({ tenantId });
      return c.json(counter);
    } catch {
      return c.json({ error: 'Dados de uso indisponíveis.' }, 503);
    }
  });

  // GET /api/tenants/:tenantId/usage/history?limit=6
  router.get('/history', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const limitStr = c.req.query('limit');
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 6, 24) : 6;

    try {
      const history = await getUsageHistory(tenantId, limit);
      return c.json(history);
    } catch {
      return c.json({ error: 'Dados de uso indisponíveis.' }, 503);
    }
  });

  // PATCH /api/tenants/:tenantId/usage/settings (16.3 AC#6 — owner only via billing:write)
  router.patch('/settings', requireTenantSession(), requirePermission('billing:write'), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    let body: { bloquear_ao_atingir_limite?: boolean; notificar_overage_a_cada?: number };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.bloquear_ao_atingir_limite === 'boolean') {
      patch['bloquear_ao_atingir_limite'] = body.bloquear_ao_atingir_limite;
    }
    // >= 0 so the UI toggle can DISABLE overage alerts by sending 0 (16.3 AC#6).
    if (typeof body.notificar_overage_a_cada === 'number' && body.notificar_overage_a_cada >= 0) {
      patch['notificar_overage_a_cada'] = body.notificar_overage_a_cada;
    }

    if (Object.keys(patch).length === 0) {
      return c.json({ error: 'No valid settings provided.' }, 400);
    }

    // Merge into tenants.config jsonb without overwriting unrelated keys.
    await withTenant(tenantId, async (tx) =>
      tx.execute(
        sql`UPDATE "tenants" SET "config" = "config" || ${JSON.stringify(patch)}::jsonb WHERE "id" = ${tenantId}`
      )
    );

    const [fresh] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ config: schema.tenants.config })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1)
    );

    return c.json({ config: fresh?.config ?? {} });
  });

  return router;
}
