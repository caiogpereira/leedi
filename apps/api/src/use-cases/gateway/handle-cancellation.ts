import { withTenant, withServiceRole, schema, eq, and } from '@leedi/db';

export interface HandleCancellationInput {
  gatewayEventId: string;
  tenantId: string;
}

const CANCELLATION_TIPOS: Record<string, string> = {
  compra_cancelada: 'compra_cancelada',
  compra_reembolsada: 'compra_reembolsada',
  chargeback: 'chargeback',
};

function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && !digits.startsWith('55')) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
    return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

export async function handleCancellation(input: HandleCancellationInput): Promise<void> {
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
  const normalized = event.payloadNormalizado as { phoneNumber?: string; buyerName?: string };
  const rawPhone = normalized.phoneNumber ?? '';
  const telefone = normalizePhone(rawPhone);
  const buyerName = normalized.buyerName ?? null;

  await withTenant(tenantId, async (tx) => {
    // Find or create lead
    const existing = await tx
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
      .limit(1);

    let leadId: string;
    if (existing[0]) {
      leadId = existing[0].id;
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
        leadId = inserted[0].id;
      } else {
        const raced = await tx
          .select({ id: schema.leads.id })
          .from(schema.leads)
          .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
          .limit(1);
        leadId = raced[0]!.id;
      }
    }

    // Revert purchase status — explicit null to clear the product FK
    await tx
      .update(schema.leads)
      .set({ comprou: false, produtoCompradoId: null, updatedAt: new Date() })
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)));

    const tipo = CANCELLATION_TIPOS[eventoTipo] ?? eventoTipo;

    // Insert journey event
    await tx.insert(schema.leadJourneyEvents).values({ tenantId, leadId, tipo, detalhes: {} });

    // Mark event processed
    await tx
      .update(schema.gatewayEvents)
      .set({ processado: true, leadId })
      .where(eq(schema.gatewayEvents.id, gatewayEventId));
  });
}
