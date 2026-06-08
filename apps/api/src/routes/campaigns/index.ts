import { Hono } from 'hono';
import { requireTenantSession } from '../../middleware/tenant-session.js';
import { rateLimitTenant } from '../../middleware/rate-limit.js';
import { getCampaigns } from '../../use-cases/campaigns/get-campaigns.js';
import { getCampaign } from '../../use-cases/campaigns/get-campaign.js';
import {
  createCampaign,
  CreateCampaignSchema,
  CampaignValidationError,
} from '../../use-cases/campaigns/create-campaign.js';
import {
  updateCampaign,
  UpdateCampaignSchema,
} from '../../use-cases/campaigns/update-campaign.js';
import { ActiveCampaignConflictError } from '../../use-cases/campaigns/assert-no-active-campaign.js';
import { syncPhaseTransitionJobs } from '../../jobs/campaign-phase-transition.js';
import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignConfig } from '../../use-cases/campaigns/update-campaign.js';

export function createCampaignsRouter() {
  const router = new Hono();

  router.use('*', rateLimitTenant());

  // GET /api/tenants/:tenantId/campaigns
  router.get('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const status = c.req.query('status');
    const campaigns = await getCampaigns(tenantId, status ? { status } : undefined);
    return c.json(campaigns);
  });

  // POST /api/tenants/:tenantId/campaigns
  router.post('/', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const body = await c.req.json().catch(() => null);
    const parsed = CreateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    try {
      const campaign = await createCampaign(tenantId, parsed.data);
      return c.json(campaign, 201);
    } catch (err) {
      if (err instanceof CampaignValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // GET /api/tenants/:tenantId/campaigns/:id
  router.get('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    const campaign = await getCampaign(tenantId, campaignId);
    if (!campaign) return c.json({ error: 'Campanha não encontrada.' }, 404);
    return c.json(campaign);
  });

  // PATCH /api/tenants/:tenantId/campaigns/:id
  router.patch('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);
    const parsed = UpdateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    try {
      // If config contains phase transitions with tipo='data', sync QStash jobs
      let input = parsed.data;
      if (input.config) {
        const syncedConfig = await syncPhaseTransitionJobs(
          tenantId,
          campaignId,
          input.config as CampaignConfig
        );
        input = { ...input, config: syncedConfig };
      }

      const campaign = await updateCampaign(tenantId, campaignId, input);
      if (!campaign) return c.json({ error: 'Campanha não encontrada.' }, 404);
      return c.json(campaign);
    } catch (err) {
      if (err instanceof CampaignValidationError) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // DELETE /api/tenants/:tenantId/campaigns/:id (only rascunho)
  router.delete('/:id', requireTenantSession(), async (c) => {
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    await withTenant(tenantId, async (tx) => {
      const [campaign] = await tx
        .select({ status: schema.campaigns.status })
        .from(schema.campaigns)
        .where(
          and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
        )
        .limit(1);

      if (!campaign) return c.json({ error: 'Campanha não encontrada.' }, 404);
      if (campaign.status !== 'rascunho') {
        return c.json(
          { error: 'Apenas campanhas em rascunho podem ser excluídas.' },
          400
        );
      }

      await tx
        .delete(schema.campaigns)
        .where(
          and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId))
        );
    });
    return c.body(null, 204);
  });

  // ─── Lifecycle endpoints (wired from Story 10.2) ───────────────────────────────
  // POST /api/tenants/:tenantId/campaigns/:id/activate
  router.post('/:id/activate', requireTenantSession(), async (c) => {
    const { activateCampaign } = await import(
      '../../use-cases/campaigns/activate-campaign.js'
    );
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    try {
      const campaign = await activateCampaign(tenantId, campaignId);
      return c.json(campaign);
    } catch (err) {
      if (err instanceof ActiveCampaignConflictError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
  });

  // POST /api/tenants/:tenantId/campaigns/:id/transition
  router.post('/:id/transition', requireTenantSession(), async (c) => {
    const { transitionCampaignPhase } = await import(
      '../../use-cases/campaigns/transition-campaign-phase.js'
    );
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    const body = await c.req.json().catch(() => null);
    const targetPhase = body?.targetPhase as string | undefined;
    if (!targetPhase) {
      return c.json({ error: 'targetPhase é obrigatório.' }, 400);
    }
    try {
      const campaign = await transitionCampaignPhase(tenantId, campaignId, targetPhase);
      return c.json(campaign);
    } catch (err) {
      if (err instanceof Error && err.message.includes('transição')) {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  // POST /api/tenants/:tenantId/campaigns/:id/pause
  router.post('/:id/pause', requireTenantSession(), async (c) => {
    const { pauseCampaign } = await import(
      '../../use-cases/campaigns/pause-campaign.js'
    );
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    const campaign = await pauseCampaign(tenantId, campaignId);
    if (!campaign) return c.json({ error: 'Campanha não encontrada.' }, 404);
    return c.json(campaign);
  });

  // POST /api/tenants/:tenantId/campaigns/:id/end
  router.post('/:id/end', requireTenantSession(), async (c) => {
    const { endCampaign } = await import('../../use-cases/campaigns/end-campaign.js');
    const tenantId = c.get('resolvedTenantId');
    const campaignId = c.req.param('id') ?? '';
    try {
      const campaign = await endCampaign(tenantId, campaignId);
      if (!campaign) return c.json({ error: 'Campanha não encontrada.' }, 404);
      return c.json(campaign);
    } catch (err) {
      if (err instanceof Error && err.message.includes('encerrada')) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
  });

  return router;
}
