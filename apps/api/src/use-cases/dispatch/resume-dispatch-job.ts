// Story 13.5 — manual resume of a quality-paused (or operator-paused) dispatch job.
//
// A job auto-paused on quality RED is NOT resumed automatically (AC#4): the tenant
// must resume it manually, and only once quality has recovered to GREEN/YELLOW.
//
// Two resume paths depending on whether the job was already materialized:
//   - Already materialized (has dispatch_targets rows): it was paused mid-send, so
//     flip to `processando` and re-enqueue `process-batch` to continue the
//     remaining `pendente` targets.
//   - Never materialized (no targets — e.g. paused at startup on quality RED, or an
//     operator paused an `agendado` job): flip back to `agendado` and re-enqueue
//     `run-dispatch-job` so it materializes the segment and starts sending. We must
//     NOT send it to `process-batch` (it would find 0 pending and finalize the job
//     as `concluido` without reaching anyone), nor blindly re-run `run-dispatch-job`
//     on an already-materialized job (that table has no unique constraint on
//     (dispatch_job_id, lead_id) → duplicate targets).

import { withTenant, schema, eq, and, sql } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from '../../utils/api-public-url.js';
import { DispatchValidationError } from './create-dispatch-job.js';
import { BATCH_SIZE } from './throttle.js';

export interface ResumeDispatchJobResult {
  id: string;
  status: string;
}

export async function resumeDispatchJob(
  tenantId: string,
  jobId: string
): Promise<ResumeDispatchJobResult> {
  const ctx = await withTenant(tenantId, async (tx) => {
    const [job] = await tx
      .select({
        id: schema.dispatchJobs.id,
        status: schema.dispatchJobs.status,
        configThrottle: schema.dispatchJobs.configThrottle,
      })
      .from(schema.dispatchJobs)
      .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, jobId)))
      .limit(1);

    const [connection] = await tx
      .select({ qualityRating: schema.whatsappConnections.qualityRating })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    const [targets] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.dispatchTargets)
      .where(
        and(
          eq(schema.dispatchTargets.tenantId, tenantId),
          eq(schema.dispatchTargets.dispatchJobId, jobId)
        )
      );

    return { job, connection, materialized: (targets?.n ?? 0) > 0 };
  });

  if (!ctx.job) throw new DispatchValidationError('Disparo não encontrado.', 404);
  if (ctx.job.status !== 'pausado') {
    throw new DispatchValidationError('Apenas disparos pausados podem ser retomados.', 409);
  }
  // Quality gate: a RED number cannot resume sending (AC#5: button only enabled on GREEN/YELLOW).
  if (ctx.connection?.qualityRating === 'vermelho') {
    throw new DispatchValidationError(
      'Não é possível retomar: seu número está com qualidade RED. Resolva o problema na Meta Business Suite antes de retomar os disparos.'
    );
  }

  // Clear the paused_reason annotation while keeping the rest of the throttle config.
  const { paused_reason: _drop, ...keep } = ctx.job.configThrottle ?? {};
  void _drop;

  const qstash = new Client({ token: env.QSTASH_TOKEN });

  if (ctx.materialized) {
    // Paused mid-send → continue the remaining pending targets.
    await withTenant(tenantId, async (tx) => {
      await tx
        .update(schema.dispatchJobs)
        .set({ status: 'processando', configThrottle: keep })
        .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, jobId)));
    });
    await qstash.publishJSON({
      url: `${apiPublicUrl()}/api/internal/dispatch/process-batch`,
      delay: 0,
      body: { dispatchJobId: jobId, tenantId, offset: 0, batchSize: BATCH_SIZE },
    });
    return { id: ctx.job.id, status: 'processando' };
  }

  // Never materialized → re-run from the top so the segment is materialized.
  // Back to `agendado` so run-dispatch-job's compare-and-set claim can fire.
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(schema.dispatchJobs)
      .set({ status: 'agendado', configThrottle: keep })
      .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, jobId)));
  });
  await qstash.publishJSON({
    url: `${apiPublicUrl()}/api/internal/dispatch/run-job`,
    delay: 0,
    body: { dispatchJobId: jobId, tenantId },
  });
  return { id: ctx.job.id, status: 'agendado' };
}
