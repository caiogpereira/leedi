import { Hono } from 'hono';
import {
  listLeads,
  getLeadDetail,
  importLeadsCsv,
  addLeadTag,
  removeLeadTag,
  updateLeadStatus,
  isUuid,
} from '@leedi/lead';
import type { LeadTemperatura, LeadStatus, LeadStatusChange } from '@leedi/lead';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { parseLeadsCsv, CsvValidationError } from '../utils/parse-leads-csv.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// 5 MB upload ceiling for CSV import (AC#4 keeps a 500-row file well under this).
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const TEMPERATURAS: readonly LeadTemperatura[] = ['frio', 'morno', 'quente'];
const STATUSES: readonly LeadStatus[] = ['ativo', 'optout', 'bloqueado'];

// Only these two transitions are operator-driven via the status route.
// 'bloqueado' is excluded here — it is set by other system paths, not this UI.
const STATUS_CHANGES: readonly LeadStatusChange[] = ['optout', 'ativo'];

const MAX_TAG_LENGTH = 50;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.trunc(n);
}

export function createLeadsRouter() {
  const router = new Hono();

  // GET /api/tenants/:tenantId/leads — paginated, filterable lead list for the current tenant
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const page = parsePositiveInt(c.req.query('page'), DEFAULT_PAGE);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      parsePositiveInt(c.req.query('pageSize'), DEFAULT_PAGE_SIZE)
    );

    const temperaturaRaw = c.req.query('temperatura');
    const temperatura = TEMPERATURAS.includes(temperaturaRaw as LeadTemperatura)
      ? (temperaturaRaw as LeadTemperatura)
      : undefined;

    const statusRaw = c.req.query('status');
    const status = STATUSES.includes(statusRaw as LeadStatus)
      ? (statusRaw as LeadStatus)
      : undefined;

    const search = c.req.query('search')?.trim() || undefined;

    const result = await listLeads({
      tenantId,
      page,
      pageSize,
      temperatura,
      status,
      search,
    });

    return c.json(result);
  });

  // POST /api/tenants/:tenantId/leads/import — bulk lead import from a CSV upload.
  // Registered BEFORE GET /:id so the literal "import" segment is never captured
  // as an :id. Expects multipart/form-data with a `file` field.
  router.post('/import', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    // Cheap pre-check: reject oversized uploads by declared length before buffering.
    const declaredLength = Number(c.req.header('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
      return c.json({ error: 'Arquivo muito grande. Limite: 5MB.' }, 400);
    }

    const body = await c.req.parseBody();
    const file = body['file'];

    if (!(file instanceof File)) {
      return c.json({ error: 'Arquivo CSV não enviado.' }, 400);
    }

    // Authoritative size check (content-length can be absent or understated).
    if (file.size > MAX_IMPORT_BYTES) {
      return c.json({ error: 'Arquivo muito grande. Limite: 5MB.' }, 400);
    }

    const text = await file.text();

    let parsed;
    try {
      parsed = parseLeadsCsv(text);
    } catch (err) {
      if (err instanceof CsvValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }

    const result = await importLeadsCsv({ tenantId, rows: parsed.valid });

    // Duplicates = in-file dups (skipped before insert) + DB conflicts on the
    // UNIQUE(tenant_id, telefone) constraint. Errors = malformed rows only (AC#5).
    const duplicated = result.duplicated + parsed.duplicates.length;

    // LGPD: log counts only, never phone numbers / names.
    console.info('[leads.import]', {
      tenantId,
      inserted: result.inserted,
      duplicated,
      errors: parsed.errors.length,
    });

    return c.json({
      inserted: result.inserted,
      duplicated,
      errors: parsed.errors,
    });
  });

  // GET /api/tenants/:tenantId/leads/:id — full lead detail (profile, tags, journey) or 404
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const leadId = c.req.param('id') ?? '';

    // getLeadDetail returns null for an unknown lead OR a malformed (non-UUID) id,
    // so both collapse into the same not-found response without hitting Postgres.
    const detail = await getLeadDetail({ tenantId, leadId });

    if (!detail) {
      return c.json({ error: 'Lead não encontrado.' }, 404);
    }

    return c.json(detail);
  });

  // POST /api/tenants/:tenantId/leads/:id/tags — add a manual tag to the lead.
  // Body: { tag: string }. origemTag is forced to 'manual' by the use case.
  router.post('/:id/tags', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const leadId = c.req.param('id') ?? '';

    // A malformed leadId can never reference a real lead; reject before the
    // insert would throw on an invalid uuid literal.
    if (!isUuid(leadId)) {
      return c.json({ error: 'Lead não encontrado.' }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as { tag?: unknown } | null;
    const rawTag = body?.tag;
    const tag = typeof rawTag === 'string' ? rawTag.trim() : '';

    if (!tag) {
      return c.json({ error: 'Tag obrigatória.' }, 400);
    }
    if (tag.length > MAX_TAG_LENGTH) {
      return c.json({ error: `Tag muito longa. Limite: ${MAX_TAG_LENGTH} caracteres.` }, 400);
    }

    const created = await addLeadTag({ tenantId, leadId, tag });

    return c.json(created, 201);
  });

  // DELETE /api/tenants/:tenantId/leads/:id/tags/:tagId — remove a tag. 204 on success.
  // Idempotent: deleting an already-gone tag still returns 204.
  router.delete('/:id/tags/:tagId', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const leadId = c.req.param('id') ?? '';
    const tagId = c.req.param('tagId') ?? '';

    await removeLeadTag({ tenantId, leadId, tagId });

    return c.body(null, 204);
  });

  // PATCH /api/tenants/:tenantId/leads/:id/status — opt-out / reactivate a lead.
  // Body: { status: 'optout' | 'ativo' }. operadorId is taken from the session,
  // NEVER the body. Status change + journey event happen in one transaction.
  router.patch('/:id/status', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const operadorId = c.get('userId');
    const leadId = c.req.param('id') ?? '';

    const body = (await c.req.json().catch(() => null)) as { status?: unknown } | null;
    const statusRaw = body?.status;

    if (!STATUS_CHANGES.includes(statusRaw as LeadStatusChange)) {
      return c.json({ error: 'Status inválido.' }, 400);
    }
    const status = statusRaw as LeadStatusChange;

    const ok = await updateLeadStatus({ tenantId, leadId, status, operadorId });

    if (!ok) {
      return c.json({ error: 'Lead não encontrado.' }, 404);
    }

    return c.json({ ok: true });
  });

  return router;
}
