import { Hono } from 'hono';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { rateLimitTenant } from '../middleware/rate-limit.js';
import { getTenantSalesMetrics } from '@leedi/analytics';
import { getTopObjections } from '@leedi/analytics';
import { withTenant, schema, eq, desc, sql } from '@leedi/db';

const MAX_DATE_RANGE_DAYS = 366;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateRange(
  fromStr: string | undefined,
  toStr: string | undefined
): { from: Date; to: Date } | null {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = fromStr ? new Date(fromStr) : firstOfMonth;
  // A date-only `to` (e.g. "2026-05-31") parses to UTC midnight, which would
  // exclude the entire final day under `lte(createdAt, to)`. Push it to the end
  // of that day so the selected end date is fully included.
  const to = toStr
    ? DATE_ONLY_RE.test(toStr)
      ? new Date(`${toStr}T23:59:59.999Z`)
      : new Date(toStr)
    : now;

  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return null;
  if ((to.getTime() - from.getTime()) / MS_PER_DAY > MAX_DATE_RANGE_DAYS) return null;

  return { from, to };
}

export function createAnalyticsRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/analytics/sales?from=&to=
  router.get('/sales', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const range = parseDateRange(c.req.query('from'), c.req.query('to'));
    if (!range) {
      return c.json({ error: 'Data inválida ou intervalo superior a 366 dias.' }, 400);
    }
    const metrics = await getTenantSalesMetrics(tenantId, range.from, range.to);
    return c.json(metrics);
  });

  // GET /api/tenants/:tenantId/analytics/objections?from=&to=
  router.get('/objections', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const range = parseDateRange(c.req.query('from'), c.req.query('to'));
    if (!range) {
      return c.json({ error: 'Data inválida ou intervalo superior a 366 dias.' }, 400);
    }
    const result = await getTopObjections(tenantId, range.from, range.to);
    return c.json(result);
  });

  // GET /api/tenants/:tenantId/analytics/connection-health
  router.get('/connection-health', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({
          status: schema.whatsappConnections.status,
          qualityRating: schema.whatsappConnections.qualityRating,
          messagingTier: schema.whatsappConnections.messagingTier,
          displayName: schema.whatsappConnections.displayName,
        })
        .from(schema.whatsappConnections)
        .where(eq(schema.whatsappConnections.status, 'conectado'))
        .limit(1)
    );

    return c.json(rows[0] ?? null);
  });

  // GET /api/tenants/:tenantId/analytics/active-campaign
  router.get('/active-campaign', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({
          id: schema.campaigns.id,
          nome: schema.campaigns.nome,
          fase: schema.campaigns.fase,
          dataFim: schema.campaigns.dataFim,
          totalAtivas: sql<number>`cast(count(*) over() as int)`,
          productNome: schema.products.nome,
          productTipo: schema.products.tipo,
        })
        .from(schema.campaigns)
        .leftJoin(schema.products, eq(schema.campaigns.produtoId, schema.products.id))
        .where(eq(schema.campaigns.status, 'ativa'))
        .orderBy(desc(schema.campaigns.updatedAt))
        .limit(1)
    );

    if (!rows[0]) return c.json(null);

    const row = rows[0];
    return c.json({
      id: row.id,
      nome: row.nome,
      fase: row.fase,
      dataFim: row.dataFim,
      totalAtivas: row.totalAtivas,
      produto: row.productNome
        ? { nome: row.productNome, tipo: row.productTipo }
        : null,
    });
  });

  return router;
}
