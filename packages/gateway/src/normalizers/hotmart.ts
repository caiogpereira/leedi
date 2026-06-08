export type GatewayEventoCanonical =
  | 'compra_aprovada'
  | 'compra_recusada'
  | 'compra_cancelada'
  | 'compra_reembolsada'
  | 'chargeback'
  | 'carrinho_abandonado'
  | 'assinatura_iniciada'
  | 'assinatura_cancelada'
  | 'assinatura_atrasada'
  | 'boleto_gerado'
  | 'pix_gerado';

export interface GatewayEvent {
  eventoCanonical: GatewayEventoCanonical | null;
  hotmartTransactionId: string | null;
  phoneNumber: string | null;
  buyerName: string | null;
  productId: string | null;
  productName: string | null;
  value: number | null;
}

const EVENT_MAP: Record<string, GatewayEventoCanonical> = {
  PURCHASE_APPROVED: 'compra_aprovada',
  PURCHASE_COMPLETE: 'compra_aprovada',
  PURCHASE_PROTEST: 'compra_cancelada',
  PURCHASE_CANCELED: 'compra_cancelada',
  PURCHASE_REFUNDED: 'compra_reembolsada',
  PURCHASE_CHARGEBACK: 'chargeback',
  PURCHASE_BILLET_PRINTED: 'boleto_gerado',
  PURCHASE_PIX_GENERATED: 'pix_gerado',
  CART_ABANDONED: 'carrinho_abandonado',
  SUBSCRIPTION_STARTED: 'assinatura_iniciada',
  SUBSCRIPTION_CANCELED: 'assinatura_cancelada',
  SUBSCRIPTION_OVERDUE: 'assinatura_atrasada',
  PURCHASE_REFUSED: 'compra_recusada',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeNumber(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export class HotmartNormalizer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static normalize(payload: Record<string, any>): GatewayEvent {
    const event = safeString(payload.event);
    const eventoCanonical = event ? (EVENT_MAP[event] ?? null) : null;

    const data = payload.data ?? {};
    const purchase = data.purchase ?? {};
    const buyer = data.buyer ?? {};
    const product = data.product ?? {};
    const price = purchase.price ?? {};

    // Dedup key: transaction id from purchase, fallback to top-level data.id
    const hotmartTransactionId =
      safeString(purchase.transaction) ?? safeString(data.id);

    return {
      eventoCanonical,
      hotmartTransactionId,
      phoneNumber: safeString(buyer.phone),
      buyerName: safeString(buyer.name),
      productId: safeString(product.id) ?? safeString(String(product.id ?? '')),
      productName: safeString(product.name),
      value: safeNumber(price.value),
    };
  }
}
