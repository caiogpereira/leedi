// Campaign phase transition QStash job scheduler + handler.
//
// When a campaign's phase config has transicao.tipo='data', we enqueue a
// QStash delayed job. The job fires at the configured date and calls
// transitionCampaignPhase. If the admin changes the date, we cancel the
// old job (by stored jobId) and enqueue a new one.
//
// Using QStash instead of BullMQ (project already has @upstash/qstash).

import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { withTenant, schema, eq, and } from '@leedi/db';
import type { CampaignConfig } from '../use-cases/campaigns/update-campaign.js';
import { transitionCampaignPhase } from '../use-cases/campaigns/transition-campaign-phase.js';
import { captureException } from '@leedi/observability';

export interface CampaignPhaseTransitionPayload {
  tenantId: string;
  campaignId: string;
  targetPhase: string;
}

function qstashClient(): Client {
  return new Client({ token: env.QSTASH_TOKEN });
}

function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

/**
 * Schedules (or reschedules) a QStash delayed job for an automatic phase transition.
 * Cancels the previous job first if `existingJobId` is provided.
 * Returns the new job ID to store in `config.*.scheduledJobId`.
 */
export async function schedulePhaseTransitionJob(params: {
  tenantId: string;
  campaignId: string;
  targetPhase: string;
  transitionDate: Date;
  existingJobId?: string;
}): Promise<string | null> {
  const { tenantId, campaignId, targetPhase, transitionDate, existingJobId } = params;

  const delayMs = transitionDate.getTime() - Date.now();
  if (delayMs <= 0) {
    // Date is in the past — skip scheduling, transition should happen immediately
    return null;
  }

  const qstash = qstashClient();

  // Cancel the stale job if the transition date was previously scheduled
  if (existingJobId) {
    await qstash.messages.delete(existingJobId).catch(() => {
      // Ignore if job already fired or doesn't exist
    });
  }

  const { messageId } = await qstash.publishJSON({
    url: `${apiBaseUrl()}/api/internal/campaign-phase-transition`,
    delay: Math.ceil(delayMs / 1000),
    body: { tenantId, campaignId, targetPhase } satisfies CampaignPhaseTransitionPayload,
  });

  return messageId;
}

/**
 * Processes an incoming campaign-phase-transition QStash job.
 * Gracefully skips if the campaign is no longer active when the job fires.
 */
export async function processCampaignPhaseTransition(
  payload: CampaignPhaseTransitionPayload
): Promise<{ skipped: boolean }> {
  const { tenantId, campaignId, targetPhase } = payload;

  // Verify campaign is still active before transitioning
  const campaignRows = await withTenant(tenantId, async (tx) =>
    tx
      .select({ status: schema.campaigns.status })
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.tenantId, tenantId), eq(schema.campaigns.id, campaignId)))
      .limit(1)
  );

  const campaign = campaignRows[0];
  if (!campaign || campaign.status !== 'ativa') {
    return { skipped: true };
  }

  try {
    await transitionCampaignPhase(tenantId, campaignId, targetPhase);
  } catch (err) {
    captureException(err as Error);
    throw err;
  }

  return { skipped: false };
}

/**
 * Extracts and schedules QStash jobs for any phase configs with transicao.tipo='data'
 * that were updated. Mutates `config` in-place to store the new scheduledJobId.
 * Returns the updated config with scheduledJobIds populated.
 */
export async function syncPhaseTransitionJobs(
  tenantId: string,
  campaignId: string,
  config: CampaignConfig
): Promise<CampaignConfig> {
  const updated = { ...config };
  const phaseMap: Array<{
    phaseKey: keyof CampaignConfig;
    nextPhase: string;
  }> = [
    { phaseKey: 'aquecimento', nextPhase: 'carrinho_aberto' },
    { phaseKey: 'carrinho_aberto', nextPhase: 'downsell' },
  ];

  for (const { phaseKey, nextPhase } of phaseMap) {
    const phaseCfg = updated[phaseKey];
    if (!phaseCfg?.transicao || phaseCfg.transicao.tipo !== 'data' || !phaseCfg.transicao.data) {
      continue;
    }

    const transitionDate = new Date(phaseCfg.transicao.data);
    if (isNaN(transitionDate.getTime())) continue;

    const scheduleParams: Parameters<typeof schedulePhaseTransitionJob>[0] = {
      tenantId,
      campaignId,
      targetPhase: nextPhase,
      transitionDate,
    };
    if (phaseCfg.transicao.scheduledJobId) {
      scheduleParams.existingJobId = phaseCfg.transicao.scheduledJobId;
    }
    const newJobId = await schedulePhaseTransitionJob(scheduleParams);

    if (newJobId) {
      updated[phaseKey] = {
        ...phaseCfg,
        transicao: {
          tipo: 'data',
          data: phaseCfg.transicao.data,
          scheduledJobId: newJobId,
        },
      };
    }
  }

  return updated;
}
