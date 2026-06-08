// Gateway event processor: dispatches to the appropriate handler based on evento_canonico.
// Invoked via /api/internal/gateway/process-event (QStash job).

import { db, schema, sql, eq } from '@leedi/db';
import { captureException } from '@leedi/observability';
import { handlePurchaseApproved } from '../use-cases/gateway/handle-purchase-approved.js';
import { handleRecoveryEvent } from '../use-cases/gateway/handle-recovery-event.js';
import { handleCancellation } from '../use-cases/gateway/handle-cancellation.js';
import { handleJourneyEventOnly } from '../use-cases/gateway/handle-journey-event-only.js';

export interface ProcessGatewayEventPayload {
  gatewayEventId: string;
  tenantId: string;
}

export async function processGatewayEvent(
  payload: ProcessGatewayEventPayload
): Promise<{ skipped: boolean; eventoCanonical: string | null }> {
  const { gatewayEventId, tenantId } = payload;

  // Fetch event (bypass RLS — internal job has no session)
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL row_security = off`);
    return tx
      .select({
        id: schema.gatewayEvents.id,
        eventoCanonical: schema.gatewayEvents.eventoCanonical,
        processado: schema.gatewayEvents.processado,
        tenantId: schema.gatewayEvents.tenantId,
      })
      .from(schema.gatewayEvents)
      .where(eq(schema.gatewayEvents.id, gatewayEventId))
      .limit(1);
  });

  const event = rows[0];
  if (!event || event.tenantId !== tenantId) {
    return { skipped: true, eventoCanonical: null };
  }

  if (event.processado) {
    return { skipped: true, eventoCanonical: event.eventoCanonical };
  }

  const eventoCanonical = event.eventoCanonical;

  try {
    switch (eventoCanonical) {
      case 'compra_aprovada':
        await handlePurchaseApproved({ gatewayEventId, tenantId });
        break;

      case 'carrinho_abandonado':
      case 'boleto_gerado':
      case 'pix_gerado':
        await handleRecoveryEvent({ gatewayEventId, tenantId });
        break;

      case 'compra_cancelada':
      case 'compra_reembolsada':
      case 'chargeback':
        await handleCancellation({ gatewayEventId, tenantId });
        break;

      case 'compra_recusada':
      case 'assinatura_iniciada':
      case 'assinatura_cancelada':
      case 'assinatura_atrasada':
        await handleJourneyEventOnly({ gatewayEventId, tenantId });
        break;

      default:
        console.log(
          `[gateway] processGatewayEvent: no handler for evento_canonico=${String(eventoCanonical)}, gatewayEventId=${gatewayEventId}`
        );
        break;
    }
  } catch (err) {
    captureException(err as Error);
    throw err;
  }

  return { skipped: false, eventoCanonical };
}
