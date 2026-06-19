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
  // Real Hotmart 2.0 deliveries (verified against the official event reference +
  // a live capture, roteiro F-43) use these names — the prior keys above/below
  // are unverified guesses kept for safety. The cart-abandonment event (the
  // recovery trigger) is PURCHASE_OUT_OF_SHOPPING_CART, and the subscription
  // cancellation event is SUBSCRIPTION_CANCELLATION (NOT *_CANCELED).
  PURCHASE_OUT_OF_SHOPPING_CART: 'carrinho_abandonado',
  SUBSCRIPTION_CANCELLATION: 'assinatura_cancelada',
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

    // Phone extraction (roteiro F-42). Hotmart 2.0 purchase events carry the
    // buyer phone as `checkout_phone` (the number) + `checkout_phone_code` (the
    // DDD/area code, e.g. "31") — NOT a single `phone` field; cart-abandonment
    // events use `phone`. Build the national number (DDD + number) and let the
    // downstream E.164 normalizer prepend +55. Fall back to `phone`.
    const checkoutPhone = safeString(buyer.checkout_phone);
    const phoneNumber = checkoutPhone
      ? `${safeString(buyer.checkout_phone_code) ?? ''}${checkoutPhone}`
      : safeString(buyer.phone);

    return {
      eventoCanonical,
      hotmartTransactionId,
      phoneNumber,
      buyerName: safeString(buyer.name),
      productId: safeString(product.id) ?? safeString(String(product.id ?? '')),
      productName: safeString(product.name),
      value: safeNumber(price.value),
    };
  }
}
