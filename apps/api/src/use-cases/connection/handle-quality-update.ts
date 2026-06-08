// Story 13.5 — maps a Meta phone_number_quality_update webhook into our
// qualityRating enum and, when the number turns RED, pauses in-flight dispatches.
//
// Runs without a tenant context (the webhook only knows phone_number_id), so it
// resolves the tenant via service role, then performs the dispatch pause within
// that tenant's RLS context.

import { withServiceRole, schema, eq } from '@leedi/db';
import { pauseDispatchesForQuality } from '../dispatch/pause-dispatches-for-quality.js';
import { sendNotificationToTenantRole } from '@leedi/notification';

export interface HandleQualityUpdateInput {
  phoneNumberId: string;
  currentLimit?: string;
  /** Meta event/quality signal, e.g. 'FLAGGED', or quality score 'GREEN'|'YELLOW'|'RED'. */
  event?: string;
}

type QualityRating = 'verde' | 'amarelo' | 'vermelho';

/** Maps a Meta quality signal to our qualityRating enum. */
export function mapQualitySignal(event: string | undefined): QualityRating {
  const v = (event ?? '').toUpperCase();
  if (v === 'FLAGGED' || v === 'LOW' || v === 'RED') return 'vermelho';
  if (v === 'HIGH' || v === 'GREEN') return 'verde';
  if (v === 'MEDIUM' || v === 'YELLOW') return 'amarelo';
  // Unknown signal → treat conservatively as yellow (do not auto-pause).
  return 'amarelo';
}

export async function handleQualityUpdate(
  input: HandleQualityUpdateInput
): Promise<{ updated: boolean; rating: QualityRating; pausedJobs: number }> {
  const rating = mapQualitySignal(input.event);

  // Resolve tenant + update the rating (service role: tenant unknown to webhook).
  const rows = await withServiceRole(async (tx) =>
    tx
      .update(schema.whatsappConnections)
      .set({ qualityRating: rating })
      .where(eq(schema.whatsappConnections.phoneNumberId, input.phoneNumberId))
      .returning({ tenantId: schema.whatsappConnections.tenantId })
  );

  const tenantId = rows[0]?.tenantId;
  if (!tenantId) return { updated: false, rating, pausedJobs: 0 };

  let pausedJobs = 0;
  if (rating === 'vermelho' || rating === 'amarelo') {
    if (rating === 'vermelho') {
      const result = await pauseDispatchesForQuality(tenantId);
      pausedJobs = result.paused;
    }
    sendNotificationToTenantRole({
      tenantId,
      roles: ['owner', 'admin'],
      tipo: 'quality_caindo',
      titulo: 'Qualidade do número caindo',
      corpo: `A qualidade do seu número WhatsApp está ${rating === 'vermelho' ? 'vermelha (crítica)' : 'amarela (atenção)'}.`,
    }).catch(() => {});
  }

  return { updated: true, rating, pausedJobs };
}
