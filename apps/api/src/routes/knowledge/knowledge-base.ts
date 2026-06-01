import { Hono } from 'hono';
import {
  createKnowledgeEntry,
  listKnowledgeBase,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  KnowledgeValidationError,
} from '@leedi/knowledge';
import { requireTenantSession } from '../../middleware/tenant-session.js';

export function createKnowledgeBaseRouter() {
  const router = new Hono();

  // GET /api/tenants/:tenantId/knowledge/knowledge-base?tipo=faq|objecao&categoria=
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const tipoRaw = c.req.query('tipo');
    const tipo =
      tipoRaw === 'faq' || tipoRaw === 'objecao' ? tipoRaw : undefined;
    const categoria = c.req.query('categoria') || undefined;

    const entries = await listKnowledgeBase({ tenantId, tipo, categoria });
    return c.json(entries);
  });

  // POST /api/tenants/:tenantId/knowledge/knowledge-base
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = await c.req.json().catch(() => null);
    try {
      const entry = await createKnowledgeEntry({ ...body, tenantId });
      return c.json(entry, 201);
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // PATCH /api/tenants/:tenantId/knowledge/knowledge-base/:id
  router.patch('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const entryId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);
    try {
      const entry = await updateKnowledgeEntry({ ...body, tenantId, entryId });
      if (!entry) return c.json({ error: 'Entrada não encontrada.' }, 404);
      return c.json(entry);
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // DELETE /api/tenants/:tenantId/knowledge/knowledge-base/:id — soft delete
  router.delete('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const entryId = c.req.param('id') ?? '';
    await deleteKnowledgeEntry(tenantId, entryId);
    return c.body(null, 204);
  });

  return router;
}
