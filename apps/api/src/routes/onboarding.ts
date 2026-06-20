import { Hono } from 'hono';
import { z } from 'zod';
import { db, withTenant, schema, eq, sql } from '@leedi/db';
import type { OnboardingConfig } from '@leedi/db';
import { requireTenantSession } from '../middleware/tenant-session.js';
import { rateLimitTenant } from '../middleware/rate-limit.js';
import { apiPublicUrl } from '../utils/api-public-url.js';

const progressPatchSchema = z.object({
  step: z.number().int().min(1).max(5),
  data: z.record(z.string(), z.unknown()),
});

const profilePatchSchema = z.object({
  name: z.string().min(1).optional(),
  logo_url: z.string().url().optional(),
  segmento: z.string().optional(),
  cnpj: z.string().optional(),
  endereco: z.string().optional(),
});

function parseOnboardingConfig(config: Record<string, unknown>): OnboardingConfig {
  const raw = config['onboarding_config'] as Partial<OnboardingConfig> | undefined;
  return {
    onboarding_completed: raw?.onboarding_completed ?? false,
    current_step: raw?.current_step ?? 1,
    steps: raw?.steps ?? {},
    gateway_webhook_received: raw?.gateway_webhook_received ?? false,
  };
}

function completedSteps(cfg: OnboardingConfig): number[] {
  return Object.keys(cfg.steps)
    .map(Number)
    .filter((n) => n < cfg.current_step)
    .sort((a, b) => a - b);
}

export function createOnboardingRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/onboarding/progress — owner only (AC#4, #6)
  router.get('/progress', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ config: schema.tenants.config })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1)
    );

    const tenant = rows[0];
    if (!tenant) return c.json({ error: 'Tenant não encontrado.' }, 404);

    const cfg = parseOnboardingConfig(tenant.config ?? {});
    return c.json({
      currentStep: cfg.current_step,
      completedSteps: completedSteps(cfg),
      stepData: cfg.steps,
    });
  });

  // PATCH /api/tenants/:tenantId/onboarding/progress — owner only (AC#5, #6)
  router.patch('/progress', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const parsed = progressPatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }
    const { step, data } = parsed.data;

    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ config: schema.tenants.config })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1)
    );

    const tenant = rows[0];
    if (!tenant) return c.json({ error: 'Tenant não encontrado.' }, 404);

    const cfg = parseOnboardingConfig(tenant.config ?? {});

    // Merge step data (idempotent — merges into existing step data)
    const updatedSteps = { ...cfg.steps, [step]: { ...(cfg.steps[step] ?? {}), ...data } };
    // Advance current_step only if this step has not yet been passed
    const newCurrentStep = cfg.current_step <= step ? step + 1 : cfg.current_step;

    const updatedOnboardingConfig: OnboardingConfig = {
      ...cfg,
      current_step: newCurrentStep,
      steps: updatedSteps,
    };

    // Merge into tenants.config jsonb without overwriting unrelated keys
    await withTenant(tenantId, async (tx) =>
      tx.execute(
        sql`UPDATE "tenants"
            SET "config" = "config" || ${JSON.stringify({ onboarding_config: updatedOnboardingConfig })}::jsonb
            WHERE "id" = ${tenantId}`
      )
    );

    return c.json({
      currentStep: updatedOnboardingConfig.current_step,
      completedSteps: completedSteps(updatedOnboardingConfig),
      stepData: updatedSteps,
    });
  });

  // PATCH /api/tenants/:tenantId/onboarding/profile — owner only (19.2 AC#1)
  router.patch('/profile', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body.' }, 400);
    }

    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }
    const { name, logo_url, segmento, cnpj, endereco } = parsed.data;

    // Update tenant name / logoUrl / cnpj / endereco directly on the tenants row
    if (name || logo_url || cnpj !== undefined || endereco !== undefined) {
      await withTenant(tenantId, async (tx) =>
        tx
          .update(schema.tenants)
          .set({
            ...(name ? { name } : {}),
            ...(logo_url ? { logoUrl: logo_url } : {}),
            ...(cnpj !== undefined ? { cnpj } : {}),
            ...(endereco !== undefined ? { endereco } : {}),
          })
          .where(eq(schema.tenants.id, tenantId))
      );
    }

    // Store segmento in config jsonb (no schema column for it)
    if (segmento !== undefined) {
      await withTenant(tenantId, async (tx) =>
        tx.execute(
          sql`UPDATE "tenants"
              SET "config" = "config" || ${JSON.stringify({ segmento })}::jsonb
              WHERE "id" = ${tenantId}`
        )
      );
    }

    return c.json({ success: true });
  });

  // GET /api/tenants/:tenantId/onboarding/gateway-webhook-url — owner only (19.3 AC#1)
  router.get('/gateway-webhook-url', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ webhookUrlPath: schema.gatewayIntegrations.webhookUrlPath })
        .from(schema.gatewayIntegrations)
        .where(eq(schema.gatewayIntegrations.tenantId, tenantId))
        .limit(1)
    );

    const integration = rows[0];

    if (integration?.webhookUrlPath) {
      return c.json({ url: `${apiPublicUrl()}/webhooks/hotmart/${integration.webhookUrlPath}` });
    }

    // No gateway integration yet — return a placeholder URL fragment
    return c.json({ url: null, message: 'Integração não configurada ainda.' });
  });

  // GET /api/tenants/:tenantId/onboarding/gateway-confirmed — owner only (19.3 AC#2)
  router.get('/gateway-confirmed', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');

    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ config: schema.tenants.config })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1)
    );

    const tenant = rows[0];
    if (!tenant) return c.json({ confirmed: false });

    const cfg = parseOnboardingConfig(tenant.config ?? {});
    return c.json({ confirmed: cfg.gateway_webhook_received === true });
  });

  // POST /api/tenants/:tenantId/onboarding/complete — owner only (19.4 AC#3)
  router.post('/complete', requireTenantSession('owner'), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const userId = c.get('userId');

    // Read current state for idempotency check
    const rows = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          config: schema.tenants.config,
          status: schema.tenants.status,
          workspaceId: schema.tenants.workspaceId,
        })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId))
        .limit(1)
    );

    const tenant = rows[0];
    if (!tenant) return c.json({ error: 'Tenant não encontrado.' }, 404);

    const cfg = parseOnboardingConfig(tenant.config ?? {});

    // Idempotent: already completed
    if (tenant.status === 'active' && cfg.onboarding_completed === true) {
      return c.json({ success: true });
    }

    // Set status to active and mark onboarding completed
    await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.tenants)
        .set({ status: 'active' })
        .where(eq(schema.tenants.id, tenantId))
    );

    const completedConfig: OnboardingConfig = {
      ...cfg,
      onboarding_completed: true,
      current_step: 5,
    };

    await withTenant(tenantId, async (tx) =>
      tx.execute(
        sql`UPDATE "tenants"
            SET "config" = "config" || ${JSON.stringify({ onboarding_config: completedConfig })}::jsonb
            WHERE "id" = ${tenantId}`
      )
    );

    // Audit log
    await db.insert(schema.auditLogs).values({
      workspaceId: tenant.workspaceId,
      actorUserId: userId,
      targetTenantId: tenantId,
      acao: 'onboarding_completed',
      detalhes: { completedAt: new Date().toISOString() },
    });

    // Welcome notification (stub — Epic 18 wires real delivery)
    console.info('[notification:stub] onboarding_concluido', {
      tenantId,
      tipo: 'onboarding_concluido',
      titulo: 'Configuração concluída! Seu agente está pronto para atender leads.',
    });

    return c.json({ success: true });
  });

  return router;
}
