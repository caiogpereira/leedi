import { Hono } from 'hono';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { requirePermission } from '../middleware/require-role.js';
import { rateLimitTenant } from '../middleware/rate-limit.js';
import { withTenant, schema, eq, desc } from '@leedi/db';

export function createBillingRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/billing/summary (AC: #1, #3, #4)
  router.get(
    '/summary',
    requireTenantSession(),
    requirePermission('billing:read'),
    async (c) => {
      const tenantId = c.get('resolvedTenantId');

      const [subscriptionRow] = await withTenant(tenantId, (tx) =>
        tx
          .select({
            plano: schema.subscriptions.plano,
            valor: schema.subscriptions.valor,
            status: schema.subscriptions.status,
            proximoVencimento: schema.subscriptions.proximoVencimento,
          })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.tenantId, tenantId))
          .limit(1)
      );

      const [tenantRow] = await withTenant(tenantId, (tx) =>
        tx
          .select({ status: schema.tenants.status, config: schema.tenants.config })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, tenantId))
          .limit(1)
      );

      const tenantConfig = (tenantRow?.config ?? {}) as Record<string, unknown>;

      return c.json({
        subscription: subscriptionRow ?? null,
        tenant: { status: tenantRow?.status ?? 'active' },
        billing_status: tenantConfig['billing_status'] ?? null,
      });
    }
  );

  // GET /api/tenants/:tenantId/billing/invoices?limit=6 (AC: #1, #2, #5)
  router.get(
    '/invoices',
    requireTenantSession(),
    requirePermission('billing:read'),
    async (c) => {
      const tenantId = c.get('resolvedTenantId');
      const limitStr = c.req.query('limit');
      const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 6, 24) : 6;

      const rows = await withTenant(tenantId, (tx) =>
        tx
          .select({
            id: schema.invoices.id,
            valor: schema.invoices.valor,
            valorOverage: schema.invoices.valorOverage,
            vencimento: schema.invoices.vencimento,
            pagoPem: schema.invoices.pagoPem,
            status: schema.invoices.status,
            receiptUrl: schema.invoices.receiptUrl,
          })
          .from(schema.invoices)
          .where(eq(schema.invoices.tenantId, tenantId))
          .orderBy(desc(schema.invoices.createdAt))
          .limit(limit)
      );

      // Never 404 — return empty array for new tenants (AC: #5)
      return c.json(rows);
    }
  );

  return router;
}
