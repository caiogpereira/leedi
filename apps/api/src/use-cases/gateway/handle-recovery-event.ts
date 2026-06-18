import { withTenant, withServiceRole, schema, eq, and, sql } from '@leedi/db';
import { Client } from '@upstash/qstash';
import { env } from '@leedi/config';
import { apiPublicUrl } from '../../utils/api-public-url.js';
import { captureException } from '@leedi/observability';

const RECOVERY_TIPOS: Record<string, string> = {
  carrinho_abandonado: 'carrinho_abandonado',
  boleto_gerado: 'boleto_gerado',
  pix_gerado: 'pix_gerado',
};

function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && !digits.startsWith('55')) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
    return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

export interface HandleRecoveryEventInput {
  gatewayEventId: string;
  tenantId: string;
}

export async function handleRecoveryEvent(input: HandleRecoveryEventInput): Promise<void> {
  const { gatewayEventId, tenantId } = input;

  const events = await withServiceRole(async (tx) =>
    tx
      .select({
        id: schema.gatewayEvents.id,
        processado: schema.gatewayEvents.processado,
        eventoCanonical: schema.gatewayEvents.eventoCanonical,
        payloadNormalizado: schema.gatewayEvents.payloadNormalizado,
      })
      .from(schema.gatewayEvents)
      .where(
        and(
          eq(schema.gatewayEvents.id, gatewayEventId),
          eq(schema.gatewayEvents.tenantId, tenantId)
        )
      )
      .limit(1)
  );

  const event = events[0];
  if (!event) return;
  if (event.processado) return;

  const eventoTipo = event.eventoCanonical ?? '';
  const normalized = event.payloadNormalizado as {
    phoneNumber?: string;
    buyerName?: string;
    productId?: string;
    productName?: string;
    hotmartTransactionId?: string;
  };

  const rawPhone = normalized.phoneNumber ?? '';
  const telefone = normalizePhone(rawPhone);
  const buyerName = normalized.buyerName ?? null;
  const productName = normalized.productName ?? null;
  const transactionId = normalized.hotmartTransactionId ?? null;

  // Persist the journey event + processado guard atomically. The dispatch-rule
  // lookup and QStash publish are intentionally performed AFTER this transaction
  // commits: a missing dispatch_rules table, an enum mismatch on `trigger`, or a
  // QStash outage would otherwise abort the transaction and silently roll back
  // the journey event and the processado guard (causing duplicate processing on
  // retry).
  const leadId = await withTenant(tenantId, async (tx) => {
    // Find or create lead
    const existing = await tx
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
      .limit(1);

    let resolvedLeadId: string;
    if (existing[0]) {
      resolvedLeadId = existing[0].id;
    } else {
      const inserted = await tx
        .insert(schema.leads)
        .values({
          tenantId,
          telefone,
          nome: buyerName ?? undefined,
          status: 'ativo',
          temperatura: 'frio',
          origem: 'gateway_hotmart',
          comprou: false,
          leadRecorrente: false,
          qualificacao: {},
        })
        .onConflictDoNothing()
        .returning({ id: schema.leads.id });

      if (inserted[0]) {
        resolvedLeadId = inserted[0].id;
      } else {
        const raced = await tx
          .select({ id: schema.leads.id })
          .from(schema.leads)
          .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
          .limit(1);
        resolvedLeadId = raced[0]!.id;
      }
    }

    const tipo = RECOVERY_TIPOS[eventoTipo] ?? eventoTipo;

    // Insert journey event
    await tx.insert(schema.leadJourneyEvents).values({
      tenantId,
      leadId: resolvedLeadId,
      tipo,
      detalhes: { product_name: productName, transaction_id: transactionId },
    });

    // Mark event processed
    await tx
      .update(schema.gatewayEvents)
      .set({ processado: true, leadId: resolvedLeadId })
      .where(eq(schema.gatewayEvents.id, gatewayEventId));

    return resolvedLeadId;
  });

  // Best-effort recovery dispatch (Story 13.3). Isolated from the critical writes
  // above so it can never roll them back. dispatch_rules may not exist yet, or
  // QStash may be down — log genuine failures instead of swallowing them silently.
  try {
    const rules = await withTenant(tenantId, async (tx) =>
      tx.execute(
        sql`SELECT id, janela_tempo FROM dispatch_rules
            WHERE tenant_id = ${tenantId}::uuid
            AND trigger = ${eventoTipo}
            AND ativo = true
            LIMIT 1`
      )
    );

    const ruleRows = (rules as unknown as { rows: Array<{ id: string; janela_tempo: unknown }> }).rows;
    if (ruleRows.length > 0) {
      const rule = ruleRows[0]!;
      const janelaTempo = rule.janela_tempo as { delay_minutes?: number } | null;
      const delayMinutes = janelaTempo?.delay_minutes ?? 60;

      const qstash = new Client({ token: env.QSTASH_TOKEN });
      await qstash.publishJSON({
        url: `${apiPublicUrl()}/api/internal/gateway/dispatch-recovery-target`,
        delay: delayMinutes * 60,
        body: { leadId, dispatchRuleId: rule.id, tenantId, gatewayEventId },
      });
    }
  } catch (err) {
    captureException(err as Error);
  }
}
