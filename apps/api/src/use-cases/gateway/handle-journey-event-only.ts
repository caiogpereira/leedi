// Handles gateway events that only require a lead_journey_events record (no side effects).
// Used for: compra_recusada, assinatura_iniciada, assinatura_cancelada, assinatura_atrasada.

import { withTenant, withServiceRole, schema, eq, and } from '@leedi/db';

function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && !digits.startsWith('55')) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
    return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

export async function handleJourneyEventOnly(input: {
  gatewayEventId: string;
  tenantId: string;
}): Promise<void> {
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
  if (!event || event.processado) return;

  const eventoTipo = event.eventoCanonical ?? '';
  const normalized = event.payloadNormalizado as { phoneNumber?: string };
  const rawPhone = normalized.phoneNumber ?? '';
  const telefone = normalizePhone(rawPhone);

  await withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
      .limit(1);

    let leadId: string | null = null;
    if (existing[0]) {
      leadId = existing[0].id;
    } else if (telefone) {
      const inserted = await tx
        .insert(schema.leads)
        .values({
          tenantId,
          telefone,
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
      }
    }

    if (leadId) {
      await tx.insert(schema.leadJourneyEvents).values({
        tenantId,
        leadId,
        tipo: eventoTipo,
        detalhes: {},
      });
    }

    await tx
      .update(schema.gatewayEvents)
      .set({ processado: true, leadId: leadId ?? undefined })
      .where(eq(schema.gatewayEvents.id, gatewayEventId));
  });
}
