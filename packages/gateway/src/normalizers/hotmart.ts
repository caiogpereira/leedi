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

 
function safeString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

 
function safeNumber(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export class HotmartNormalizer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static normalize(payload: Record<string, any>): GatewayEvent {
    const event = safeString(payload.event);
    let eventoCanonical = event ? (EVENT_MAP[event] ?? null) : null;

    const data = payload.data ?? {};
    const purchase = data.purchase ?? {};
    const buyer = data.buyer ?? {};
    const product = data.product ?? {};
    const price = purchase.price ?? {};
    const payment = purchase.payment ?? {};
    const paymentType = safeString(payment.type);

    // PIX generation has NO dedicated event (Hotmart support + verified against a
    // real PIX checkout, roteiro F-43): Hotmart reuses `PURCHASE_BILLET_PRINTED`
    // for both billet AND PIX, differentiated only by `purchase.payment.type`
    // (the real PIX delivery carried `status: 'BILLET_PRINTED'`, NOT
    // 'WAITING_PAYMENT'). Reclassify a PIX-typed billet-printed event so the
    // `pix_gerado` recovery trigger can actually fire.
    if (eventoCanonical === 'boleto_gerado' && paymentType === 'PIX') {
      eventoCanonical = 'pix_gerado';
    }

    // Dedup key: transaction id from purchase, fallback to top-level data.id
    const hotmartTransactionId =
      safeString(purchase.transaction) ?? safeString(data.id);

    // Phone extraction (roteiro F-42). Hotmart 2.0 purchase events carry the
    // buyer phone in `checkout_phone` + `checkout_phone_code` (DDD), NOT a single
    // `phone` field; cart-abandonment events use `phone`. Verified against a real
    // checkout: `checkout_phone` ALREADY includes the DDD (e.g. '35999731201'
    // with code '35'), so use it as-is; only prepend the DDD code when the number
    // arrives DDD-less (<10 digits, the shape in Hotmart's docs example). The
    // downstream E.164 normalizer prepends +55. Fall back to `phone`.
    const checkoutPhone = safeString(buyer.checkout_phone);
    let phoneNumber: string | null;
    if (checkoutPhone) {
      const code = safeString(buyer.checkout_phone_code);
      const digits = checkoutPhone.replace(/\D/g, '');
      phoneNumber = code && digits.length < 10 ? `${code}${checkoutPhone}` : checkoutPhone;
    } else {
      phoneNumber = safeString(buyer.phone);
    }

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
