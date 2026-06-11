import { withTenant, withServiceRole, schema, eq, and, sql } from '@leedi/db';
import { sendNotificationToTenantRole } from '@leedi/notification';

export interface HandlePurchaseApprovedInput {
  gatewayEventId: string;
  tenantId: string;
}

/** Normalizes a phone to E.164. Handles Hotmart's common BR formats. */
function normalizePhone(raw: string): string {
  if (!raw) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && !digits.startsWith('55')) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
    return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

export async function handlePurchaseApproved(
  input: HandlePurchaseApprovedInput
): Promise<void> {
  const { gatewayEventId, tenantId } = input;

  // Fetch event (bypass RLS — internal job)
  const events = await withServiceRole(async (tx) =>
    tx
      .select({
        id: schema.gatewayEvents.id,
        processado: schema.gatewayEvents.processado,
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

  // Idempotency guard
  if (event.processado) return;

  const normalized = event.payloadNormalizado as {
    phoneNumber?: string;
    buyerName?: string;
    productId?: string;
    productName?: string;
    value?: number;
    hotmartTransactionId?: string;
  };

  const rawPhone = normalized.phoneNumber ?? '';
  const telefone = normalizePhone(rawPhone);
  const buyerName = normalized.buyerName ?? null;
  const gatewayProductId = normalized.productId ?? null;
  const productName = normalized.productName ?? null;
  const value = normalized.value ?? null;
  const transactionId = normalized.hotmartTransactionId ?? null;

  const didProcess = await withTenant(tenantId, async (tx) => {
    // Resolve or create lead
    const existing = await tx
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
      .limit(1);

    let leadId: string;
    if (existing[0]) {
      leadId = existing[0].id;
    } else {
      // Create new lead with buyer data
      const inserted = await tx
        .insert(schema.leads)
        .values({
          tenantId,
          telefone,
          nome: buyerName ?? undefined,
          status: 'ativo',
          temperatura: 'frio',
          origem: 'gateway_hotmart',
          comprou: true,
          leadRecorrente: false,
          qualificacao: {},
        })
        .onConflictDoNothing()
        .returning({ id: schema.leads.id });

      if (inserted[0]) {
        leadId = inserted[0].id;
      } else {
        // Race condition — re-select
        const raced = await tx
          .select({ id: schema.leads.id })
          .from(schema.leads)
          .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
          .limit(1);
        leadId = raced[0]!.id;
      }
    }

    // Idempotency: check if journey event for this transaction already exists
    if (transactionId) {
      const existingJourney = await tx
        .select({ id: schema.leadJourneyEvents.id })
        .from(schema.leadJourneyEvents)
        .where(
          sql`tenant_id = ${tenantId}::uuid AND lead_id = ${leadId}::uuid AND tipo = 'comprou' AND detalhes->>'transaction_id' = ${transactionId}`
        )
        .limit(1);
      if (existingJourney[0]) {
        // Already processed — update lead_id linkage if needed but skip re-processing
        await tx
          .update(schema.gatewayEvents)
          .set({ processado: true, leadId })
          .where(eq(schema.gatewayEvents.id, gatewayEventId));
        return false; // idempotent re-run — do not re-notify
      }
    }

    // Resolve product by gateway_product_id
    let produtoCompradoId: string | null = null;
    if (gatewayProductId) {
      const products = await tx
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(
          and(
            eq(schema.products.tenantId, tenantId),
            eq(schema.products.gatewayProductId, gatewayProductId)
          )
        )
        .limit(1);
      if (products[0]) {
        produtoCompradoId = products[0].id;
      } else {
        console.warn(
          `[gateway] handlePurchaseApproved: product not found for gateway_product_id=${gatewayProductId}, tenantId=${tenantId}`
        );
      }
    }

    // Update lead
    await tx
      .update(schema.leads)
      .set({
        comprou: true,
        produtoCompradoId: produtoCompradoId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.id, leadId)));

    // Insert journey event
    await tx.insert(schema.leadJourneyEvents).values({
      tenantId,
      leadId,
      tipo: 'comprou',
      detalhes: { product_name: productName, value, transaction_id: transactionId },
    });

    // Mark event processed
    await tx
      .update(schema.gatewayEvents)
      .set({ processado: true, leadId })
      .where(eq(schema.gatewayEvents.id, gatewayEventId));

    return true;
  });

  // Notify operators/admins/owners of the new sale (Story 18.2 AC#3).
  // Skipped on the idempotent re-run path so a duplicated event never re-notifies.
  if (!didProcess) return;

  sendNotificationToTenantRole({
    tenantId,
    roles: ['owner', 'admin', 'operator'],
    tipo: 'venda_aprovada',
    titulo: 'Nova venda!',
    corpo: `${buyerName ?? 'Lead'} comprou ${productName ?? 'um produto'}.`,
  }).catch(() => {});
}
