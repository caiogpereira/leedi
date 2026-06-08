// Story 13.2 — creates a scheduled mass-template dispatch job.
//
// Validates the template (must be aprovado), the segment, and the schedule time,
// enforces the quality gate (RED blocks creation), resolves the tenant's
// messaging tier into a throttle config, persists the dispatch_jobs row, and
// schedules a QStash delayed job that fires run-dispatch-job at agendado_para.

import { withTenant, schema, eq, and } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import {
  tierIntervalMs,
  type MessagingTier,
} from './throttle.js';

export class DispatchValidationError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'DispatchValidationError';
    this.status = status;
  }
}

export interface CreateDispatchJobInput {
  templateId: string;
  segmentId: string;
  agendadoPara: string; // ISO datetime
  campaignId?: string;
}

export interface CreateDispatchJobResult {
  id: string;
  status: string;
  agendadoPara: string;
}

function qstashClient(): Client {
  return new Client({ token: env.QSTASH_TOKEN });
}

function apiBaseUrl(): string {
  return env.BETTER_AUTH_URL.replace(':3000', `:${env.API_PORT}`);
}

export async function createDispatchJob(
  tenantId: string,
  input: CreateDispatchJobInput
): Promise<CreateDispatchJobResult> {
  const agendadoPara = new Date(input.agendadoPara);
  if (Number.isNaN(agendadoPara.getTime())) {
    throw new DispatchValidationError('Data de agendamento inválida.');
  }
  if (agendadoPara.getTime() <= Date.now()) {
    throw new DispatchValidationError('O disparo deve ser agendado para o futuro.');
  }

  // Validate template + segment + read connection quality/tier in one tenant tx.
  const { template, segment, connection } = await withTenant(tenantId, async (tx) => {
    const [template] = await tx
      .select({ id: schema.templates.id, status: schema.templates.status })
      .from(schema.templates)
      .where(and(eq(schema.templates.tenantId, tenantId), eq(schema.templates.id, input.templateId)))
      .limit(1);

    const [segment] = await tx
      .select({ id: schema.segments.id })
      .from(schema.segments)
      .where(and(eq(schema.segments.tenantId, tenantId), eq(schema.segments.id, input.segmentId)))
      .limit(1);

    const [connection] = await tx
      .select({
        qualityRating: schema.whatsappConnections.qualityRating,
        messagingTier: schema.whatsappConnections.messagingTier,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantId))
      .limit(1);

    return { template, segment, connection };
  });

  if (!template) throw new DispatchValidationError('Template não encontrado.', 404);
  if (template.status !== 'aprovado') {
    throw new DispatchValidationError(
      'O template precisa estar aprovado pela Meta antes de ser disparado.'
    );
  }
  if (!segment) throw new DispatchValidationError('Segmento não encontrado.', 404);

  // Quality gate: a RED number cannot start new mass dispatches.
  if (connection?.qualityRating === 'vermelho') {
    throw new DispatchValidationError(
      'A qualidade do número está VERMELHA. Disparos em massa estão bloqueados até a recuperação da qualidade.'
    );
  }

  const tier = (connection?.messagingTier ?? null) as MessagingTier | null;
  const intervalMs = tierIntervalMs(tier);

  // Schedule the QStash delayed job FIRST so we can persist its id in config.
  const delaySeconds = Math.max(0, Math.ceil((agendadoPara.getTime() - Date.now()) / 1000));

  // Create the job row, then schedule QStash, then write back the job id.
  const created = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(schema.dispatchJobs)
      .values({
        tenantId,
        templateId: input.templateId,
        segmentId: input.segmentId,
        campaignId: input.campaignId ?? null,
        tipo: 'template_massa',
        status: 'agendado',
        agendadoPara,
        configThrottle: { tier, tier_interval_ms: intervalMs },
      })
      .returning({ id: schema.dispatchJobs.id, status: schema.dispatchJobs.status });
    return row!;
  });

  const { messageId } = await qstashClient().publishJSON({
    url: `${apiBaseUrl()}/api/internal/dispatch/run-job`,
    delay: delaySeconds,
    body: { dispatchJobId: created.id, tenantId },
  });

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(schema.dispatchJobs)
      .set({ configThrottle: { tier, tier_interval_ms: intervalMs, qstash_job_id: messageId } })
      .where(and(eq(schema.dispatchJobs.tenantId, tenantId), eq(schema.dispatchJobs.id, created.id)));
  });

  return {
    id: created.id,
    status: created.status,
    agendadoPara: agendadoPara.toISOString(),
  };
}
