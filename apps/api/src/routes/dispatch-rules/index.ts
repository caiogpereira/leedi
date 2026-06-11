import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { withTenant, schema, eq, and } from '@leedi/db';

const VALID_TRIGGERS = [
  'carrinho_abandonado',
  'boleto_gerado',
  'pix_gerado',
  'sem_resposta_48h',
  'fim_oferta_24h',
] as const;
type Trigger = (typeof VALID_TRIGGERS)[number];

/** A janelaTempo is valid when delay_minutes is absent or a finite, non-negative number. */
function isValidJanela(janela: { delay_minutes?: number } | undefined): boolean {
  if (janela === undefined) return true;
  const d = janela.delay_minutes;
  if (d === undefined) return true;
  return typeof d === 'number' && Number.isFinite(d) && d >= 0;
}

/** Returns true if the template exists for the tenant AND is aprovado. */
async function templateIsApproved(tenantId: string, templateId: string): Promise<boolean> {
  const [tpl] = await withTenant(tenantId, async (tx) =>
    tx
      .select({ status: schema.templates.status })
      .from(schema.templates)
      .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, templateId)))
      .limit(1)
  );
  return tpl?.status === 'aprovado';
}

export function createDispatchRulesRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET / — list rules
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(schema.dispatchRules)
        .where(eq(schema.dispatchRules.tenantId, tenantId))
    );
    return c.json(rows);
  });

  // POST / — create rule (default ativo:false). If ativo:true, template must be aprovado.
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = (await c.req.json().catch(() => null)) as {
      nome?: string;
      trigger?: string;
      templateId?: string;
      janelaTempo?: { delay_minutes?: number };
      ativo?: boolean;
    } | null;

    if (!body?.nome?.trim() || !body?.trigger || !body?.templateId) {
      return c.json({ error: 'nome, trigger e templateId são obrigatórios.' }, 422);
    }
    if (!VALID_TRIGGERS.includes(body.trigger as Trigger)) {
      return c.json({ error: 'Trigger inválido.' }, 422);
    }
    if (!isValidJanela(body.janelaTempo)) {
      return c.json({ error: 'Janela de tempo inválida: delay_minutes deve ser um número não negativo.' }, 422);
    }
    if (body.ativo === true && !(await templateIsApproved(tenantId, body.templateId))) {
      return c.json(
        { error: 'A regra só pode ser ativada com um template aprovado.' },
        422
      );
    }

    const [created] = await withTenant(tenantId, async (tx) =>
      tx
        .insert(schema.dispatchRules)
        .values({
          tenantId,
          nome: body.nome!.trim(),
          trigger: body.trigger as Trigger,
          templateId: body.templateId!,
          janelaTempo: body.janelaTempo ?? { delay_minutes: 60 },
          ativo: body.ativo === true,
        })
        .returning()
    );
    return c.json(created, 201);
  });

  // GET /:id
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const [rule] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(schema.dispatchRules)
        .where(and(eq(schema.dispatchRules.tenantId, tenantId), eq(schema.dispatchRules.id, id)))
        .limit(1)
    );
    if (!rule) return c.json({ error: 'Regra não encontrada.' }, 404);
    return c.json(rule);
  });

  // PATCH /:id — update; toggling ativo:true requires aprovado template
  router.patch('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const body = (await c.req.json().catch(() => null)) as {
      nome?: string;
      trigger?: string;
      templateId?: string;
      janelaTempo?: { delay_minutes?: number };
      ativo?: boolean;
    } | null;
    if (!body) return c.json({ error: 'Corpo inválido.' }, 422);
    if (!isValidJanela(body.janelaTempo)) {
      return c.json({ error: 'Janela de tempo inválida: delay_minutes deve ser um número não negativo.' }, 422);
    }

    // Resolve the effective templateId for the approval check when activating.
    if (body.ativo === true) {
      let templateId = body.templateId;
      if (!templateId) {
        const [existing] = await withTenant(tenantId, async (tx) =>
          tx
            .select({ templateId: schema.dispatchRules.templateId })
            .from(schema.dispatchRules)
            .where(
              and(eq(schema.dispatchRules.tenantId, tenantId), eq(schema.dispatchRules.id, id))
            )
            .limit(1)
        );
        templateId = existing?.templateId;
      }
      if (!templateId || !(await templateIsApproved(tenantId, templateId))) {
        return c.json(
          { error: 'A regra só pode ser ativada com um template aprovado.' },
          422
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.nome === 'string') updates.nome = body.nome.trim();
    if (body.trigger && VALID_TRIGGERS.includes(body.trigger as Trigger))
      updates.trigger = body.trigger;
    if (body.templateId) updates.templateId = body.templateId;
    if (body.janelaTempo) updates.janelaTempo = body.janelaTempo;
    if (typeof body.ativo === 'boolean') updates.ativo = body.ativo;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: 'Nada para atualizar.' }, 422);
    }

    const [updated] = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.dispatchRules)
        .set(updates)
        .where(and(eq(schema.dispatchRules.tenantId, tenantId), eq(schema.dispatchRules.id, id)))
        .returning()
    );
    if (!updated) return c.json({ error: 'Regra não encontrada.' }, 404);
    return c.json(updated);
  });

  // DELETE /:id — reject if recovery targets reference this rule (the FK has no
  // ON DELETE, so a bare delete would raise an unhandled FK violation → 500).
  router.delete('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const id = c.req.param('id') ?? '';
    const conflict = await withTenant(tenantId, async (tx) => {
      const [dep] = await tx
        .select({ id: schema.dispatchTargets.id })
        .from(schema.dispatchTargets)
        .where(
          and(
            eq(schema.dispatchTargets.tenantId, tenantId),
            eq(schema.dispatchTargets.dispatchRuleId, id)
          )
        )
        .limit(1);
      if (dep) return true;
      await tx
        .delete(schema.dispatchRules)
        .where(and(eq(schema.dispatchRules.tenantId, tenantId), eq(schema.dispatchRules.id, id)));
      return false;
    });
    if (conflict) {
      return c.json(
        { error: 'Esta regra possui disparos associados e não pode ser excluída.' },
        409
      );
    }
    return c.body(null, 204);
  });

  return router;
}
