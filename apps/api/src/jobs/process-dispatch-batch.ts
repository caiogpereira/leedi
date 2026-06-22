// Story 13.2 — process-dispatch-batch QStash handler.
//
// Sends up to batchSize pending targets via the WhatsApp template API, records
// each wamid, updates job counters, and chains the NEXT batch with a tier-based
// delay. Uses a status-based cursor (always the first N 'pendente' rows) so
// retries and chained invocations stay correct without offset arithmetic.

import { withTenant, schema, eq, and, sql, inArray } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from '../utils/api-public-url.js';
import { MetaCloudProvider } from '@leedi/connection';
import { captureException } from '@leedi/observability';
import { sendNotificationToTenantRole } from '@leedi/notification';
import { BATCH_SIZE, tierDelaySeconds } from '../use-cases/dispatch/throttle.js';

interface DispatchThrottleConfig {
  tier?: string | null;
  tier_interval_ms?: number;
  qstash_job_id?: string;
  paused_reason?: string;
}

export interface ProcessDispatchBatchPayload {
  dispatchJobId: string;
  tenantId: string;
  offset?: number;
  batchSize?: number;
}

export async function processDispatchBatch(
  payload: ProcessDispatchBatchPayload
): Promise<{ done: boolean; sent: number; failed: number }> {
  const { dispatchJobId, tenantId } = payload;
  // Nullish-coalescing keeps 0; an explicit 0 would .limit(0) and prematurely
  // finalise the job with pending targets unsent — guard against it.
  const batchSize =
    payload.batchSize && payload.batchSize > 0 ? payload.batchSize : BATCH_SIZE;

  const ctx = await withTenant(tenantId, async (tx) => {
    const [job] = await tx
      .select({
        id: schema.dispatchJobs.id,
        status: schema.dispatchJobs.status,
        templateId: schema.dispatchJobs.templateId,
        configThrottle: schema.dispatchJobs.configThrottle,
      })
      .from(schema.dispatchJobs)
      .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, dispatchJobId)))
      .limit(1);

    if (!job) return { job: null as null };

    const [template] = job.templateId
      ? await tx
          .select({ nome: schema.templates.nome })
          .from(schema.templates)
          .where(eq(schema.templates.id, job.templateId))
          .limit(1)
      : [undefined];

    const [connection] = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    return { job, template, connection };
  });

  if (!ctx.job) return { done: true, sent: 0, failed: 0 };
  if (ctx.job.status === 'pausado' || ctx.job.status === 'concluido' || ctx.job.status === 'erro') {
    return { done: true, sent: 0, failed: 0 };
  }

  // Fetch the next batch of pending targets (status-based cursor).
  const targets = await withTenant(tenantId, async (tx) =>
    tx
      .select({
        id: schema.dispatchTargets.id,
        leadId: schema.dispatchTargets.leadId,
      })
      .from(schema.dispatchTargets)
      .where(
        and(
          eq(schema.dispatchTargets.dispatchJobId, dispatchJobId),
          eq(schema.dispatchTargets.status, 'pendente')
        )
      )
      .orderBy(schema.dispatchTargets.createdAt)
      .limit(batchSize)
  );

  // No more pending → finalise.
  if (targets.length === 0) {
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(schema.dispatchJobs)
        .set({ status: 'concluido' })
        .where(eq(schema.dispatchJobs.id, dispatchJobId));
    });
    const [counters] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ enviados: schema.dispatchJobs.enviados, falhas: schema.dispatchJobs.falhas })
        .from(schema.dispatchJobs)
        .where(eq(schema.dispatchJobs.id, dispatchJobId))
        .limit(1)
    );
    sendNotificationToTenantRole({
      tenantId,
      roles: ['owner', 'admin', 'operator'],
      tipo: 'disparo_concluido',
      titulo: 'Disparo concluído',
      corpo: `Disparo finalizado: ${counters?.enviados ?? 0} enviados, ${counters?.falhas ?? 0} falhas.`,
    }).catch(() => {});
    return { done: true, sent: 0, failed: 0 };
  }

  // Resolve lead phones for this batch.
  const leadIds = targets.map((t) => t.leadId);
  const leads = await withTenant(tenantId, async (tx) =>
    tx
      .select({ id: schema.leads.id, telefone: schema.leads.telefone })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), inArray(schema.leads.id, leadIds)))
  );
  const phoneByLead = new Map(leads.map((l) => [l.id, l.telefone]));

  const templateName = ctx.template?.nome ?? '';
  const provider = ctx.connection ? new MetaCloudProvider(ctx.connection) : null;

  let sent = 0;
  let failed = 0;
  let aborted = false;

  for (const target of targets) {
    // Honour pause / quality-RED before EACH send (AC#7): an operator pause or a
    // quality drop mid-batch must stop the remaining sends, not only the next batch.
    const [live] = await withTenant(tenantId, async (tx) =>
      tx
        .select({ status: schema.dispatchJobs.status })
        .from(schema.dispatchJobs)
        .where(eq(schema.dispatchJobs.id, dispatchJobId))
        .limit(1)
    );
    if (live?.status === 'pausado' || live?.status === 'concluido' || live?.status === 'erro') {
      aborted = true;
      break;
    }

    // PL-17 — atomic claim BEFORE the send: pendente -> enviando, conditional on
    // the row still being pendente. A QStash redelivery (or a concurrent worker)
    // that already claimed this row gets 0 affected rows and skips it, so a
    // successful send is never repeated. A row left `enviando` (claimed but the
    // process died before/around the send) is deliberately NOT auto-retried — it
    // has no wamid to reconcile and re-sending would re-introduce the duplicate.
    const claimed = await withTenant(tenantId, async (tx) =>
      tx
        .update(schema.dispatchTargets)
        .set({ status: 'enviando' })
        .where(
          and(
            eq(schema.dispatchTargets.id, target.id),
            eq(schema.dispatchTargets.status, 'pendente')
          )
        )
        .returning({ id: schema.dispatchTargets.id })
    );
    if (claimed.length === 0) continue;

    const telefone = phoneByLead.get(target.leadId);
    if (!provider || !telefone || !templateName) {
      await withTenant(tenantId, async (tx) => {
        await tx
          .update(schema.dispatchTargets)
          .set({ status: 'falhou', motivoExclusao: 'dados_incompletos' })
          .where(eq(schema.dispatchTargets.id, target.id));
      });
      failed += 1;
      continue;
    }
    try {
      const { messageId } = await provider.sendTemplate(telefone, templateName, []);
      await withTenant(tenantId, async (tx) => {
        await tx
          .update(schema.dispatchTargets)
          .set({ status: 'enviado', wamid: messageId, enviadoEm: new Date() })
          .where(eq(schema.dispatchTargets.id, target.id));
      });
      sent += 1;
    } catch (err) {
      captureException(err as Error);
      await withTenant(tenantId, async (tx) => {
        await tx
          .update(schema.dispatchTargets)
          .set({ status: 'falhou' })
          .where(eq(schema.dispatchTargets.id, target.id));
      });
      failed += 1;
    }
  }

  // Update aggregate counters atomically.
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(schema.dispatchJobs)
      .set({
        enviados: sql`${schema.dispatchJobs.enviados} + ${sent}`,
        falhas: sql`${schema.dispatchJobs.falhas} + ${failed}`,
      })
      .where(eq(schema.dispatchJobs.id, dispatchJobId));
  });

  // If we aborted mid-batch (pause / quality-RED), don't chain another batch —
  // the remaining targets stay 'pendente' for a manual resume.
  if (aborted) {
    return { done: true, sent, failed };
  }

  // Chain the next batch with a tier-based delay. The deduplicationId is keyed on
  // the last target processed so a QStash redelivery of THIS handler doesn't
  // double-schedule the same next batch, while a genuine next batch (different
  // pending rows) still goes through.
  const throttle = (ctx.job.configThrottle ?? {}) as DispatchThrottleConfig;
  const delaySeconds = tierDelaySeconds(throttle.tier_interval_ms ?? 1000, batchSize);
  const lastTargetId = targets[targets.length - 1]?.id ?? 'none';
  const qstash = new Client({ token: env.QSTASH_TOKEN });
  await qstash.publishJSON({
    url: `${apiPublicUrl()}/api/internal/dispatch/process-batch`,
    delay: delaySeconds,
    deduplicationId: `dispatch-batch:${dispatchJobId}:${lastTargetId}`,
    body: { dispatchJobId, tenantId, offset: 0, batchSize },
  });

  return { done: false, sent, failed };
}
