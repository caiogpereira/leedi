import { Hono, type Context } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { withTenant, schema, eq, and, sql, desc, inArray } from '@leedi/db';
import {
  createDispatchJob,
  DispatchValidationError,
} from '../../use-cases/dispatch/create-dispatch-job.js';
import { resumeDispatchJob } from '../../use-cases/dispatch/resume-dispatch-job.js';

const DISPATCH_STATUSES = ['agendado', 'processando', 'concluido', 'pausado', 'erro'] as const;
type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

/**
 * A guarded status transition matched zero rows: the job either doesn't exist
 * (404) or is in a terminal state that can't make this transition (409).
 */
async function resolveTransitionConflict(
  c: Context,
  tenantId: string,
  id: string,
  action: 'pausado' | 'cancelado'
): Promise<Response> {
  const [exists] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ status: schema.dispatchJobs.status })
      .from(schema.dispatchJobs)
      .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, id)))
      .limit(1)
  );
  if (!exists) return c.json({ error: 'Disparo não encontrado.' }, 404);
  const verb = action === 'pausado' ? 'pausado' : 'cancelado';
  return c.json(
    { error: `Disparo não pode ser ${verb} no status atual (${exists.status}).` },
    409
  );
}

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
    // Validate pagination — a non-numeric/negative ?limit or ?offset must not
    // reach .limit()/.offset() (NaN/negative → SQL error → 500).
    const rawLimit = Number(c.req.query('limit') ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
    const rawOffset = Number(c.req.query('offset') ?? 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0;

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

  // POST /:id/pause — only a live job (agendado/processando) can be paused.
  router.post('/:id/pause', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [updated] = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.dispatchJobs)
        .set({ status: 'pausado' })
        .where(
          and(
            eq(schema.dispatchJobs.tenantId, tenantId),
            eq(schema.dispatchJobs.id, id),
            inArray(schema.dispatchJobs.status, ['agendado', 'processando'])
          )
        )
        .returning({ id: schema.dispatchJobs.id, status: schema.dispatchJobs.status })
    );
    if (updated) return c.json(updated);
    return resolveTransitionConflict(c, tenantId, id, 'pausado');
  });

  // POST /:id/cancel — terminal stop (sets erro so chained batches abort);
  // a job already in a terminal state cannot be resurrected.
  router.post('/:id/cancel', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [updated] = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.dispatchJobs)
        .set({ status: 'erro' })
        .where(
          and(
            eq(schema.dispatchJobs.tenantId, tenantId),
            eq(schema.dispatchJobs.id, id),
            inArray(schema.dispatchJobs.status, ['agendado', 'processando', 'pausado'])
          )
        )
        .returning({ id: schema.dispatchJobs.id, status: schema.dispatchJobs.status })
    );
    if (updated) return c.json(updated);
    return resolveTransitionConflict(c, tenantId, id, 'cancelado');
  });

  // POST /:id/resume — manual resume of a paused job (Story 13.5 AC#5).
  // Blocked while quality is RED; re-enqueues a batch to continue sending.
  router.post('/:id/resume', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    try {
      const result = await resumeDispatchJob(tenantId, id);
      return c.json(result);
    } catch (err) {
      if (err instanceof DispatchValidationError) {
        return c.json({ error: err.message }, err.status as 404 | 409 | 422);
      }
      throw err;
    }
  });

  return router;
}
