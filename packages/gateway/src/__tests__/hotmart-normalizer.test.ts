import { describe, it, expect } from 'vitest';
import { HotmartNormalizer } from '../normalizers/hotmart.js';

function makePayload(event: string, overrides: Record<string, unknown> = {}) {
  return {
    event,
    data: {
      purchase: {
        transaction: 'HP12345678901234',
        price: { value: 297 },
      },
      buyer: { phone: '+5511999998888', name: 'João Silva' },
      product: { id: 'PROD-001', name: 'Curso Premium' },
      ...overrides,
    },
  };
}

describe('HotmartNormalizer.normalize', () => {
  it.each([
    ['PURCHASE_APPROVED', 'compra_aprovada'],
    ['PURCHASE_COMPLETE', 'compra_aprovada'],
    ['PURCHASE_PROTEST', 'compra_cancelada'],
    ['PURCHASE_CANCELED', 'compra_cancelada'],
    ['PURCHASE_REFUNDED', 'compra_reembolsada'],
    ['PURCHASE_CHARGEBACK', 'chargeback'],
    ['PURCHASE_BILLET_PRINTED', 'boleto_gerado'],
    ['PURCHASE_PIX_GENERATED', 'pix_gerado'],
    ['CART_ABANDONED', 'carrinho_abandonado'],
    ['SUBSCRIPTION_STARTED', 'assinatura_iniciada'],
    ['SUBSCRIPTION_CANCELED', 'assinatura_cancelada'],
    ['SUBSCRIPTION_OVERDUE', 'assinatura_atrasada'],
    ['PURCHASE_REFUSED', 'compra_recusada'],
  ] as const)(
    'maps Hotmart event %s to canonical %s',
    (hotmartEvent, expectedCanonical) => {
      const result = HotmartNormalizer.normalize(makePayload(hotmartEvent));
      expect(result.eventoCanonical).toBe(expectedCanonical);
    }
  );

  it('returns eventoCanonical: null for unknown event types', () => {
    const result = HotmartNormalizer.normalize(makePayload('SOME_FUTURE_EVENT'));
    expect(result.eventoCanonical).toBeNull();
  });

  it('extracts canonical fields from payload including buyerName', () => {
    const payload = {
      event: 'PURCHASE_APPROVED',
      data: {
        purchase: { transaction: 'HP12345678901234', price: { value: 297 } },
        buyer: { phone: '+5511999998888', name: 'João Silva' },
        product: { id: 'PROD-001', name: 'Curso Premium' },
      },
    };
    const result = HotmartNormalizer.normalize(payload);
    expect(result.hotmartTransactionId).toBe('HP12345678901234');
    expect(result.phoneNumber).toBe('+5511999998888');
    expect(result.buyerName).toBe('João Silva');
    expect(result.productId).toBe('PROD-001');
    expect(result.productName).toBe('Curso Premium');
    expect(result.value).toBe(297);
  });

  it('returns null buyerName when buyer.name is absent', () => {
    const payload = {
      event: 'PURCHASE_APPROVED',
      data: {
        purchase: { transaction: 'HP12345678901234', price: { value: 297 } },
        buyer: { phone: '+5511999998888' },
        product: { id: 'PROD-001', name: 'Curso Premium' },
      },
    };
    const result = HotmartNormalizer.normalize(payload);
    expect(result.buyerName).toBeNull();
    expect(result.phoneNumber).toBe('+5511999998888');
  });

  it('falls back to data.id for dedup key when transaction is missing', () => {
    const payload = {
      event: 'CART_ABANDONED',
      data: {
        id: 'DATA-ID-001',
        buyer: { phone: '+5511999998888' },
        product: { id: 'PROD-001', name: 'Curso Premium' },
      },
    };
    const result = HotmartNormalizer.normalize(payload);
    expect(result.hotmartTransactionId).toBe('DATA-ID-001');
    expect(result.eventoCanonical).toBe('carrinho_abandonado');
  });

  it('returns null fields when payload is missing buyer/product data', () => {
    const result = HotmartNormalizer.normalize({ event: 'CART_ABANDONED', data: {} });
    expect(result.phoneNumber).toBeNull();
    expect(result.productId).toBeNull();
    expect(result.productName).toBeNull();
    expect(result.value).toBeNull();
    expect(result.hotmartTransactionId).toBeNull();
  });

  it('handles payload with no event field gracefully', () => {
    const result = HotmartNormalizer.normalize({ data: {} });
    expect(result.eventoCanonical).toBeNull();
  });

  // roteiro F-43: real Hotmart 2.0 event names verified against the official
  // event reference + a live capture.
  it('maps PURCHASE_OUT_OF_SHOPPING_CART (real cart-abandonment event) to carrinho_abandonado', () => {
    const result = HotmartNormalizer.normalize({
      event: 'PURCHASE_OUT_OF_SHOPPING_CART',
      data: { buyer: { phone: '31999998888' } },
    });
    expect(result.eventoCanonical).toBe('carrinho_abandonado');
  });

  it('maps SUBSCRIPTION_CANCELLATION (real event name) to assinatura_cancelada', () => {
    const result = HotmartNormalizer.normalize({ event: 'SUBSCRIPTION_CANCELLATION', data: {} });
    expect(result.eventoCanonical).toBe('assinatura_cancelada');
  });

  // roteiro F-42: purchase events carry buyer.checkout_phone (number) +
  // checkout_phone_code (DDD); there is no buyer.phone on those events.
  it('builds phone from checkout_phone_code (DDD) + checkout_phone on purchase events', () => {
    const result = HotmartNormalizer.normalize({
      event: 'PURCHASE_APPROVED',
      data: {
        purchase: { transaction: 'HP1', price: { value: 297 } },
        buyer: { name: 'Comprador', checkout_phone: '999998888', checkout_phone_code: '31' },
      },
    });
    expect(result.phoneNumber).toBe('31999998888');
  });

  it('falls back to buyer.phone when checkout_phone is absent (cart-abandonment events)', () => {
    const result = HotmartNormalizer.normalize({
      event: 'PURCHASE_OUT_OF_SHOPPING_CART',
      data: { buyer: { phone: '31999998888' } },
    });
    expect(result.phoneNumber).toBe('31999998888');
  });

  // roteiro F-42 (real-data correction): a real Hotmart checkout sends
  // checkout_phone ALREADY including the DDD ('35999731201' with code '35') —
  // must NOT double the DDD into '3535999731201'.
  it('uses checkout_phone as-is when it already includes the DDD (>=10 digits)', () => {
    const result = HotmartNormalizer.normalize({
      event: 'PURCHASE_APPROVED',
      data: {
        purchase: { transaction: 'HP1', payment: { type: 'CREDIT_CARD' } },
        buyer: { name: 'Caio', checkout_phone: '35999731201', checkout_phone_code: '35' },
      },
    });
    expect(result.phoneNumber).toBe('35999731201');
  });

  // roteiro F-43 (PIX): Hotmart has no dedicated PIX event — it reuses
  // PURCHASE_BILLET_PRINTED with payment.type=PIX (verified against a real PIX
  // checkout). Reclassify to pix_gerado so the recovery trigger can fire.
  it('reclassifies PURCHASE_BILLET_PRINTED with payment.type=PIX to pix_gerado', () => {
    const result = HotmartNormalizer.normalize({
      event: 'PURCHASE_BILLET_PRINTED',
      data: {
        purchase: { transaction: 'HP0530924253', status: 'BILLET_PRINTED', payment: { type: 'PIX' } },
        buyer: { checkout_phone: '35999731201', checkout_phone_code: '35' },
      },
    });
    expect(result.eventoCanonical).toBe('pix_gerado');
  });

  it('keeps PURCHASE_BILLET_PRINTED as boleto_gerado when payment.type is not PIX', () => {
    const result = HotmartNormalizer.normalize({
      event: 'PURCHASE_BILLET_PRINTED',
      data: { purchase: { transaction: 'HP2', status: 'BILLET_PRINTED', payment: { type: 'BILLET' } } },
    });
    expect(result.eventoCanonical).toBe('boleto_gerado');
  });
});
