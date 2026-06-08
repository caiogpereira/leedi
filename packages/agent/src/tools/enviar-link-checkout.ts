// Tool: enviar_link_checkout — always-on action. Sends the lead a WhatsApp
// message with a product's checkout link, then persists the outbound message.
//
// schema-vs-ctx boundary: Claude supplies ONLY `productId`. tenantId, leadPhone,
// connectionId and conversationWindowId come from ToolContext.
//
// Flow (AC#1):
//   1. Fetch the product (id + tenantId) → read nome + link_checkout.
//   2. Load the tenant's WhatsApp connection → build MetaCloudProvider.
//   3. sendText with the EXACT body: "Aqui está o link para {nome}: {link_checkout}".
//   4. Persist the outbound message to `messages` with autor='agente'.
//   5. Return { sent: true, messageId }.

import { withTenant, schema, eq, and } from '@leedi/db';
import { MetaCloudProvider } from '@leedi/connection';
import type { ToolContext } from './types.js';

export interface EnviarLinkCheckoutInput {
  productId: string;
}

export interface EnviarLinkCheckoutResult {
  sent: boolean;
  messageId: string;
}

/**
 * Sends the checkout link for `productId` to the lead over WhatsApp and records
 * the outbound message. The message body is formatted EXACTLY as the spec
 * requires — the lead sees this literal text.
 */
export async function enviarLinkCheckout(
  input: EnviarLinkCheckoutInput,
  ctx: Pick<ToolContext, 'tenantId' | 'leadPhone' | 'connectionId' | 'conversationWindowId' | 'leadId'>
): Promise<EnviarLinkCheckoutResult> {
  // 1 + 2: read the product and the connection inside one tenant-scoped tx (RLS).
  const { product, connection } = await withTenant(ctx.tenantId, async (tx) => {
    const [product] = await tx
      .select({
        nome: schema.products.nome,
        linkCheckout: schema.products.linkCheckout,
      })
      .from(schema.products)
      .where(
        and(
          eq(schema.products.tenantId, ctx.tenantId),
          eq(schema.products.id, input.productId)
        )
      )
      .limit(1);

    // One connection per tenant (whatsapp_connections is unique on tenant_id).
    const [connection] = await tx
      .select({
        phoneNumberId: schema.whatsappConnections.phoneNumberId,
        wabaId: schema.whatsappConnections.wabaId,
        accessTokenEncrypted: schema.whatsappConnections.accessTokenEncrypted,
        accessTokenIv: schema.whatsappConnections.accessTokenIv,
      })
      .from(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, ctx.tenantId))
      .limit(1);

    return { product, connection };
  });

  if (!product) {
    return Promise.reject(new Error(`Product not found: ${input.productId}`));
  }
  if (!connection) {
    return Promise.reject(new Error('WhatsApp connection not found for tenant'));
  }

  // 3: EXACT body — the lead sees this literal text (AC#1).
  const body = `Aqui está o link para ${product.nome}: ${product.linkCheckout}`;
  const provider = new MetaCloudProvider(connection);
  const { messageId } = await provider.sendText(ctx.leadPhone, body);

  // 4: persist the outbound message — MUST be autor='agente'.
  await withTenant(ctx.tenantId, async (tx) =>
    tx.insert(schema.messages).values({
      tenantId: ctx.tenantId,
      conversationWindowId: ctx.conversationWindowId,
      leadId: ctx.leadId,
      direction: 'outbound',
      autor: 'agente',
      tipo: 'texto',
      content: body,
      metaMessageId: messageId,
      status: 'enviado',
    })
  );

  return { sent: true, messageId };
}
