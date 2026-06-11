// Story 13.2 — run-dispatch-job QStash handler.
//
// Fires at the scheduled time. Re-checks the quality gate, materialises the
// target list from the segment (applying exclusion rules), and schedules the
// first process-dispatch-batch job. Idempotent: only acts on status='agendado'.

import { withTenant, schema, eq, and, sql, inArray } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { resolveSegmentLeadIds, type SegmentFilters } from '../use-cases/segments/evaluate-segment.js';
import { BATCH_SIZE } from '../use-cases/dispatch/throttle.js';

export interface RunDispatchJobPayload {
  dispatchJobId: string;
  tenantId: string;
}

const TARGET_INSERT_CHUNK = 500;

function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

interface ExcludableLead {
  id: string;
  status: 'ativo' | 'optout' | 'bloqueado';
  produtoCompradoId: string | null;
}

export async function runDispatchJob(
  payload: RunDispatchJobPayload
): Promise<{ skipped: boolean; reason?: string; totalAlvos?: number }> {
  const { dispatchJobId, tenantId } = payload;

  // Load job + segment filtros + campaign produto + connection quality.
  const ctx = await withTenant(tenantId, async (tx) => {
    const [job] = await tx
      .select({
        id: schema.dispatchJobs.id,
        status: schema.dispatchJobs.status,
        segmentId: schema.dispatchJobs.segmentId,
        campaignId: schema.dispatchJobs.campaignId,
        configThrottle: schema.dispatchJobs.configThrottle,
      })
      .from(schema.dispatchJobs)
      .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, dispatchJobId)))
      .limit(1);

    if (!job) return { job: null as null };

    const [connection] = await tx
      .select({ qualityRating: schema.whatsappConnections.qualityRating })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    let filtros: SegmentFilters = {};
    if (job.segmentId) {
      const [segment] = await tx
        .select({ filtros: schema.segments.filtros })
        .from(schema.segments)
        .where(eq(schema.segments.id, job.segmentId))
        .limit(1);
      filtros = (segment?.filtros ?? {}) as SegmentFilters;
    }

    let campaignProdutoId: string | null = null;
    if (job.campaignId) {
      const [campaign] = await tx
        .select({ produtoId: schema.campaigns.produtoId })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, job.campaignId))
        .limit(1);
      campaignProdutoId = campaign?.produtoId ?? null;
    }

    return { job, connection, filtros, campaignProdutoId };
  });

  if (!ctx.job) return { skipped: true, reason: 'job_not_found' };
  if (ctx.job.status !== 'agendado') return { skipped: true, reason: 'not_agendado' };

  // Quality gate: a RED number pauses the job instead of sending.
  if (ctx.connection?.qualityRating === 'vermelho') {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(schema.dispatchJobs)
        .set({
          status: 'pausado',
          configThrottle: { ...ctx.job!.configThrottle, paused_reason: 'quality_red' },
        })
        .where(eq(schema.dispatchJobs.id, dispatchJobId));
    });
    return { skipped: true, reason: 'quality_red' };
  }

  // Mark processing with a compare-and-set: the status check above is a separate
  // read, so under QStash at-least-once delivery two concurrent runs could both
  // pass it and double-materialise the target list. Gate the transition on
  // status='agendado' and abort if another delivery already claimed the job.
  const claimed = await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.dispatchJobs)
      .set({ status: 'processando' })
      .where(
        and(
          eq(schema.dispatchJobs.id, dispatchJobId),
          eq(schema.dispatchJobs.status, 'agendado')
        )
      )
      .returning({ id: schema.dispatchJobs.id })
  );
  if (claimed.length === 0) {
    return { skipped: true, reason: 'already_claimed' };
  }

  // Resolve all candidate leads from the segment, then read their exclusion fields.
  const leadIds = await resolveSegmentLeadIds(tenantId, ctx.filtros);

  const targetRows: Array<{
    dispatchJobId: string;
    leadId: string;
    tenantId: string;
    status: 'pendente' | 'excluido';
    motivoExclusao: string | null;
  }> = [];

  if (leadIds.length > 0) {
    const leads = await withTenant(tenantId, async (tx) =>
      tx
        .select({
          id: schema.leads.id,
          status: schema.leads.status,
          produtoCompradoId: schema.leads.produtoCompradoId,
        })
        .from(schema.leads)
        .where(and(eq(schema.leads.tenantId, tenantId), inArray(schema.leads.id, leadIds)))
    );

    // Active conversation window check (within last 24h, not ended).
    const activeWindows = await withTenant(tenantId, async (tx) =>
      tx
        .select({ leadId: schema.conversationWindows.leadId })
        .from(schema.conversationWindows)
        .where(
          and(
            eq(schema.conversationWindows.tenantId, tenantId),
            sql`${schema.conversationWindows.endedAt} IS NULL`,
            sql`${schema.conversationWindows.startedAt} > now() - interval '24 hours'`,
            inArray(schema.conversationWindows.leadId, leadIds)
          )
        )
    );
    const leadsWithActiveWindow = new Set(activeWindows.map((w) => w.leadId));

    for (const lead of leads as ExcludableLead[]) {
      let motivo: string | null = null;
      if (lead.status === 'optout') {
        motivo = 'optout';
      } else if (lead.status === 'bloqueado') {
        motivo = 'bloqueado';
      } else if (
        ctx.campaignProdutoId &&
        lead.produtoCompradoId &&
        lead.produtoCompradoId === ctx.campaignProdutoId
      ) {
        motivo = 'ja_comprou';
      } else if (leadsWithActiveWindow.has(lead.id)) {
        motivo = 'conversa_ativa';
      }

      targetRows.push({
        dispatchJobId,
        leadId: lead.id,
        tenantId,
        status: motivo ? 'excluido' : 'pendente',
        motivoExclusao: motivo,
      });
    }
  }

  // Batch-insert targets in chunks.
  if (targetRows.length > 0) {
    await withTenant(tenantId, async (tx) => {
      for (let i = 0; i < targetRows.length; i += TARGET_INSERT_CHUNK) {
        const chunk = targetRows.slice(i, i + TARGET_INSERT_CHUNK);
        await tx.insert(schema.dispatchTargets).values(chunk);
      }
    });
  }

  const pendentes = targetRows.filter((t) => t.status === 'pendente').length;

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(schema.dispatchJobs)
      .set({ totalAlvos: pendentes })
      .where(eq(schema.dispatchJobs.id, dispatchJobId));
  });

  // If nobody to send to, finish immediately.
  if (pendentes === 0) {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(schema.dispatchJobs)
        .set({ status: 'concluido' })
        .where(eq(schema.dispatchJobs.id, dispatchJobId));
    });
    return { skipped: false, totalAlvos: 0 };
  }

  // Schedule the first batch immediately.
  const qstash = new Client({ token: env.QSTASH_TOKEN });
  await qstash.publishJSON({
    url: `${apiBaseUrl()}/api/internal/dispatch/process-batch`,
    delay: 0,
    body: { dispatchJobId, tenantId, offset: 0, batchSize: BATCH_SIZE },
  });

  return { skipped: false, totalAlvos: pendentes };
}
