import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { withTenant, schema, eq, and, sql } from '@leedi/db';
import {
  evaluateSegment,
  type SegmentFilters,
} from '../../use-cases/segments/evaluate-segment.js';

/** A filters object is valid only if it carries at least one recognised key. */
function hasAtLeastOneFilter(filtros: unknown): filtros is SegmentFilters {
  if (!filtros || typeof filtros !== 'object') return false;
  const f = filtros as Record<string, unknown>;
  const keys = ['comprou', 'tag', 'origem', 'data_captura_inicio', 'data_captura_fim'];
  return keys.some((k) => {
    const v = f[k];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v !== '';
    return true;
  });
}

export function createSegmentsRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/segments — list segments (no per-segment count for V1)
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          id: schema.segments.id,
          nome: schema.segments.nome,
          filtros: schema.segments.filtros,
          createdAt: schema.segments.createdAt,
          updatedAt: schema.segments.updatedAt,
        })
        .from(schema.segments)
        .where(eq(schema.segments.tenantId, tenantId))
    );
    return c.json(rows);
  });

  // POST /api/tenants/:tenantId/segments — create
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = (await c.req.json().catch(() => null)) as {
      nome?: unknown;
      filtros?: unknown;
    } | null;

    const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
    if (!nome) {
      return c.json({ error: 'O nome do segmento é obrigatório.' }, 422);
    }
    if (!hasAtLeastOneFilter(body?.filtros)) {
      return c.json(
        { error: 'Adicione pelo menos um filtro para criar um segmento.' },
        422
      );
    }

    const [created] = await withTenant(tenantId, async (tx) =>
      tx
        .insert(schema.segments)
        .values({
          tenantId,
          nome,
          filtros: body!.filtros as Record<string, unknown>,
        })
        .returning()
    );
    return c.json(created, 201);
  });

  // POST /api/tenants/:tenantId/segments/preview — evaluate without saving
  router.post('/preview', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = (await c.req.json().catch(() => null)) as { filtros?: unknown } | null;
    const filtros = (body?.filtros ?? {}) as SegmentFilters;
    const result = await evaluateSegment(tenantId, filtros);
    return c.json(result);
  });

  // GET /api/tenants/:tenantId/segments/:id — single
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [segment] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(schema.segments)
        .where(and(eq(schema.segments.tenantId, tenantId), eq(schema.segments.id, id)))
        .limit(1)
    );
    if (!segment) return c.json({ error: 'Segmento não encontrado.' }, 404);
    return c.json(segment);
  });

  // GET /api/tenants/:tenantId/segments/:id/preview — evaluate a saved segment
  router.get('/:id/preview', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [segment] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ filtros: schema.segments.filtros })
        .from(schema.segments)
        .where(and(eq(schema.segments.tenantId, tenantId), eq(schema.segments.id, id)))
        .limit(1)
    );
    if (!segment) return c.json({ error: 'Segmento não encontrado.' }, 404);
    const result = await evaluateSegment(tenantId, segment.filtros as SegmentFilters);
    return c.json(result);
  });

  // PATCH /api/tenants/:tenantId/segments/:id — update nome or filtros
  router.patch('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const body = (await c.req.json().catch(() => null)) as {
      nome?: unknown;
      filtros?: unknown;
    } | null;

    const updates: { nome?: string; filtros?: Record<string, unknown> } = {};
    if (typeof body?.nome === 'string') {
      const nome = body.nome.trim();
      if (!nome) return c.json({ error: 'O nome do segmento é obrigatório.' }, 422);
      updates.nome = nome;
    }
    if (body?.filtros !== undefined) {
      if (!hasAtLeastOneFilter(body.filtros)) {
        return c.json({ error: 'Adicione pelo menos um filtro para criar um segmento.' }, 422);
      }
      updates.filtros = body.filtros as Record<string, unknown>;
    }
    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'Nada para atualizar.' }, 422);
    }

    const [updated] = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.segments)
        .set(updates)
        .where(and(eq(schema.segments.tenantId, tenantId), eq(schema.segments.id, id)))
        .returning()
    );
    if (!updated) return c.json({ error: 'Segmento não encontrado.' }, 404);
    return c.json(updated);
  });

  // DELETE /api/tenants/:tenantId/segments/:id — reject if active dispatch jobs use it
  router.delete('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';

    const conflict = await withTenant(tenantId, async (tx) => {
      // "Active" excludes terminal jobs: a segment referenced only by
      // concluido/erro jobs can still be deleted (AC#6).
      const active = await tx
        .select({ id: schema.dispatchJobs.id })
        .from(schema.dispatchJobs)
        .where(
          and(
            eq(schema.dispatchJobs.tenantId, tenantId),
            eq(schema.dispatchJobs.segmentId, id),
            sql`${schema.dispatchJobs.status} NOT IN ('concluido', 'erro')`
          )
        )
        .limit(1);

      if (active[0]) return true;

      await tx
        .delete(schema.segments)
        .where(and(eq(schema.segments.tenantId, tenantId), eq(schema.segments.id, id)));
      return false;
    });

    if (conflict) {
      return c.json(
        { error: 'Este segmento está em uso por um disparo ativo e não pode ser excluído.' },
        409
      );
    }
    return c.body(null, 204);
  });

  return router;
}
