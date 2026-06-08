import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { withTenant, schema, eq, and, sql, desc } from '@leedi/db';
import {
  createDispatchJob,
  DispatchValidationError,
} from '../../use-cases/dispatch/create-dispatch-job.js';

const DISPATCH_STATUSES = ['agendado', 'processando', 'concluido', 'pausado', 'erro'] as const;
type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

export function createDispatchJobsRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // POST / — create a scheduled mass-template dispatch
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = (await c.req.json().catch(() => null)) as {
      templateId?: string;
      segmentId?: string;
      agendadoPara?: string;
      campaignId?: string;
    } | null;

    if (!body?.templateId || !body?.segmentId || !body?.agendadoPara) {
      return c.json(
        { error: 'templateId, segmentId e agendadoPara são obrigatórios.' },
        422
      );
    }

    try {
      const result = await createDispatchJob(tenantId, {
        templateId: body.templateId,
        segmentId: body.segmentId,
        agendadoPara: body.agendadoPara,
        ...(body.campaignId ? { campaignId: body.campaignId } : {}),
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof DispatchValidationError) {
        return c.json({ error: err.message }, err.status as 404 | 422);
      }
      throw err;
    }
  });

  // GET / — list with optional status filter + pagination
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const rawStatus = c.req.query('status');
    // Whitelist the enum before binding — an arbitrary ?status=foo must not 500.
    const status =
      rawStatus && DISPATCH_STATUSES.includes(rawStatus as DispatchStatus)
        ? (rawStatus as DispatchStatus)
        : undefined;
    if (rawStatus && !status) {
      return c.json({ error: 'Status inválido.' }, 422);
    }
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
    const offset = Number(c.req.query('offset') ?? 0);

    const rows = await withTenant(tenantId, async (tx) => {
      const where = status
        ? and(
            eq(schema.dispatchJobs.tenantId, tenantId),
            eq(schema.dispatchJobs.status, status)
          )
        : eq(schema.dispatchJobs.tenantId, tenantId);
      return tx
        .select()
        .from(schema.dispatchJobs)
        .where(where)
        .orderBy(desc(schema.dispatchJobs.createdAt))
        .limit(limit)
        .offset(offset);
    });
    return c.json(rows);
  });

  // GET /:id — detail with target counts grouped by status
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';

    const data = await withTenant(tenantId, async (tx) => {
      const [job] = await tx
        .select()
        .from(schema.dispatchJobs)
        .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, id)))
        .limit(1);
      if (!job) return null;

      const counts = await tx
        .select({
          status: schema.dispatchTargets.status,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.dispatchTargets)
        .where(
          and(
            eq(schema.dispatchTargets.tenantId, tenantId),
            eq(schema.dispatchTargets.dispatchJobId, id)
          )
        )
        .groupBy(schema.dispatchTargets.status);

      const targetCounts: Record<string, number> = {};
      for (const row of counts) targetCounts[row.status] = row.count;

      return { ...job, targetCounts };
    });

    if (!data) return c.json({ error: 'Disparo não encontrado.' }, 404);
    return c.json(data);
  });

  // POST /:id/pause
  router.post('/:id/pause', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [updated] = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.dispatchJobs)
        .set({ status: 'pausado' })
        .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, id)))
        .returning({ id: schema.dispatchJobs.id, status: schema.dispatchJobs.status })
    );
    if (!updated) return c.json({ error: 'Disparo não encontrado.' }, 404);
    return c.json(updated);
  });

  // POST /:id/cancel — terminal stop (sets erro so chained batches abort)
  router.post('/:id/cancel', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [updated] = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.dispatchJobs)
        .set({ status: 'erro' })
        .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, id)))
        .returning({ id: schema.dispatchJobs.id, status: schema.dispatchJobs.status })
    );
    if (!updated) return c.json({ error: 'Disparo não encontrado.' }, 404);
    return c.json(updated);
  });

  return router;
}
