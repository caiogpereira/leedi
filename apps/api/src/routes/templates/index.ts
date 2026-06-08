import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { getTemplates } from '../../use-cases/templates/get-templates.js';
import {
  createTemplate,
  CreateTemplateSchema,
  TemplateValidationError,
} from '../../use-cases/templates/create-template.js';
import {
  updateTemplate,
  UpdateTemplateSchema,
} from '../../use-cases/templates/update-template.js';
import { submitTemplate } from '../../use-cases/templates/submit-template.js';
import { withTenant, withServiceRole, schema, eq, and } from '@leedi/db';

export function createTemplatesRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/templates
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const status = c.req.query('status');
    const templates = await getTemplates(tenantId, status ? { status } : undefined);
    return c.json(templates);
  });

  // POST /api/tenants/:tenantId/templates
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = await c.req.json().catch(() => null);
    const parsed = CreateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    try {
      const template = await createTemplate(tenantId, parsed.data);
      return c.json(template, 201);
    } catch (err) {
      if (err instanceof TemplateValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // GET /api/tenants/:tenantId/templates/:id
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const templateId = c.req.param('id') ?? '';
    const [template] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(schema.templates)
        .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
        .limit(1)
    );
    if (!template) return c.json({ error: 'Template não encontrado.' }, 404);
    return c.json(template);
  });

  // PATCH /api/tenants/:tenantId/templates/:id
  router.patch('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const templateId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    try {
      const template = await updateTemplate(tenantId, templateId, parsed.data);
      if (!template) return c.json({ error: 'Template não encontrado.' }, 404);
      return c.json(template);
    } catch (err) {
      if (err instanceof TemplateValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // DELETE /api/tenants/:tenantId/templates/:id (only rascunho)
  router.delete('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const templateId = c.req.param('id') ?? '';

    await withTenant(tenantId, async (tx) => {
      const [template] = await tx
        .select({ status: schema.templates.status })
        .from(schema.templates)
        .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
        .limit(1);

      if (!template) return c.json({ error: 'Template não encontrado.' }, 404);
      if (template.status !== 'rascunho') {
        return c.json({ error: 'Apenas templates em rascunho podem ser excluídos.' }, 400);
      }

      await tx
        .delete(schema.templates)
        .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)));
    });

    return c.body(null, 204);
  });

  // POST /api/tenants/:tenantId/templates/:id/submit
  router.post('/:id/submit', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const templateId = c.req.param('id') ?? '';
    try {
      const template = await submitTemplate(tenantId, templateId);
      return c.json(template);
    } catch (err) {
      if (err instanceof TemplateValidationError) {
        return c.json({ error: err.message }, 400);
      }
      if (err instanceof Error) {
        // Surface Meta API error in Portuguese-friendly format
        const metaError = translateMetaError(err.message);
        return c.json({ error: metaError }, 422);
      }
      throw err;
    }
  });

  // POST /api/tenants/:tenantId/templates/:id/duplicate
  router.post('/:id/duplicate', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const templateId = c.req.param('id') ?? '';

    const [source] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(schema.templates)
        .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
        .limit(1)
    );

    if (!source) return c.json({ error: 'Template não encontrado.' }, 404);

    const parsedInput = CreateTemplateSchema.safeParse({
      nome: `${source.nome}_copia`,
      categoria: source.categoria,
      idioma: source.idioma,
      componentes: source.componentes,
      variaveis: source.variaveis,
      connectionId: source.connectionId ?? undefined,
    });

    if (!parsedInput.success) {
      return c.json({ error: parsedInput.error.message }, 400);
    }

    const duplicate = await createTemplate(tenantId, parsedInput.data);
    return c.json(duplicate, 201);
  });

  // GET /api/tenants/:tenantId/template-library
  router.get('/library', requireTenantSession(), async (c) => {
    const categoriaOcasiao = c.req.query('categoria_ocasiao');

    const rows = await withServiceRole(async (tx) => {
      const query = tx
        .select()
        .from(schema.templateLibrary)
        .where(eq(schema.templateLibrary.isGlobal, true));
      return query;
    });

    const filtered = categoriaOcasiao
      ? rows.filter((r) => r.categoriaOcasiao === categoriaOcasiao)
      : rows;

    return c.json(filtered);
  });

  return router;
}

/** Maps common Meta API error messages to Portuguese. */
function translateMetaError(message: string): string {
  if (
    message.toLowerCase().includes('duplicate') ||
    message.toLowerCase().includes('already exists')
  ) {
    return 'Já existe um template com este nome aprovado pela Meta. Escolha um nome diferente.';
  }
  return `Erro ao enviar template para a Meta: ${message}`;
}
