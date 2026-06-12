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

/**
 * Maps a Meta quality signal to our qualityRating enum, or `null` for an
 * unknown/benign signal. Returning null (instead of defaulting to amarelo) lets
 * the caller leave the stored rating untouched and stay silent — an unmapped
 * event must not clobber a healthy `verde` nor fire a false alert.
 */
export function mapQualitySignal(event: string | undefined): QualityRating | null {
  const v = (event ?? '').toUpperCase();
  if (v === 'FLAGGED' || v === 'LOW' || v === 'RED') return 'vermelho';
  if (v === 'HIGH' || v === 'GREEN') return 'verde';
  if (v === 'MEDIUM' || v === 'YELLOW') return 'amarelo';
  return null;
}

export async function handleQualityUpdate(
  input: HandleQualityUpdateInput
): Promise<{ updated: boolean; rating: QualityRating | null; pausedJobs: number }> {
  const rating = mapQualitySignal(input.event);

  // Unknown/benign signal → leave the stored rating and tenant state untouched.
  if (rating === null) {
    return { updated: false, rating: null, pausedJobs: 0 };
  }

  // Resolve tenant, capture the PREVIOUS rating, then update (service role:
  // tenant unknown to webhook). The previous value lets us distinguish a
  // recovery (RED → GREEN/YELLOW) from steady-state noise.
  const rows = await withServiceRole(async (tx) => {
    const [prev] = await tx
      .select({
        tenantId: schema.whatsappConnections.tenantId,
        previous: schema.whatsappConnections.qualityRating,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.phoneNumberId, input.phoneNumberId))
      .limit(1);
    if (!prev) return [] as { tenantId: string; previous: QualityRating | null }[];
    await tx
      .update(schema.whatsappConnections)
      .set({ qualityRating: rating })
      .where(eq(schema.whatsappConnections.phoneNumberId, input.phoneNumberId));
    return [{ tenantId: prev.tenantId, previous: prev.previous }];
  });

  const tenantId = rows[0]?.tenantId;
  if (!tenantId) return { updated: false, rating, pausedJobs: 0 };
  const previous = rows[0]?.previous ?? null;

  let pausedJobs = 0;
  if (rating === 'vermelho') {
    const result = await pauseDispatchesForQuality(tenantId);
    pausedJobs = result.paused;
    sendNotificationToTenantRole({
      tenantId,
      roles: ['owner', 'admin'],
      // `quality_caindo` is the event key exposed in the notification-preferences
      // matrix (Story 18.2 AC#3). Emitting any other tipo here leaves the user's
      // toggle disconnected — an unknown tipo silently defaults to ON.
      tipo: 'quality_caindo',
      titulo: 'Disparos pausados — qualidade RED',
      corpo:
        '⚠️ Seu número teve queda de qualidade (RED). Todos os disparos ativos foram pausados automaticamente. Resolva o problema na Meta Business Suite antes de retomar.',
    }).catch(() => {});
  } else if ((rating === 'verde' || rating === 'amarelo') && previous === 'vermelho') {
    // Recovery from RED. Jobs are NOT auto-resumed (manual resume — AC#4).
    const label = rating === 'verde' ? 'GREEN' : 'YELLOW';
    sendNotificationToTenantRole({
      tenantId,
      roles: ['owner', 'admin'],
      tipo: 'quality_restaurada',
      titulo: 'Qualidade do número restaurada',
      corpo: `✅ Qualidade do número restaurada para ${label}. Você pode retomar os disparos pausados manualmente em Disparos.`,
    }).catch(() => {});
  }

  return { updated: true, rating, pausedJobs };
}
