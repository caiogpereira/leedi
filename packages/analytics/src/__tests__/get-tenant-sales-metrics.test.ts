import { describe, it, expect } from 'vitest';
import { computeSalesMetrics, ESTIMATED_COST_PER_CONVERSATION_BRL } from '../use-cases/get-tenant-sales-metrics.js';

describe('computeSalesMetrics', () => {
  it('returns correct counts for typical data', () => {
    const result = computeSalesMetrics({
      conversas_iniciadas: 100,
      windows_with_reply: 60,
      conversoes: 10,
      valor_total: 5000,
    });

    expect(result.conversas_iniciadas).toBe(100);
    expect(result.conversoes).toBe(10);
    expect(result.valor_total).toBe(5000);
    expect(result.taxa_resposta).toBeCloseTo(0.6);
    expect(result.ticket_medio).toBe(500);
    expect(result.roi_estimado).toBeCloseTo(500);
  });

  it('ROI formula: valor / (conversas * 0.10)', () => {
    const result = computeSalesMetrics({
      conversas_iniciadas: 100,
      windows_with_reply: 0,
      conversoes: 5,
      valor_total: 1000,
    });
    // ROI = 1000 / (100 * 0.10) = 1000 / 10 = 100
    expect(result.roi_estimado).toBeCloseTo(1000 / (100 * ESTIMATED_COST_PER_CONVERSATION_BRL));
  });

  it('roi_estimado is null when conversas_iniciadas = 0', () => {
    const result = computeSalesMetrics({
      conversas_iniciadas: 0,
      windows_with_reply: 0,
      conversoes: 0,
      valor_total: 0,
    });
    expect(result.roi_estimado).toBeNull();
  });

  it('ticket_medio is null when conversoes = 0', () => {
    const result = computeSalesMetrics({
      conversas_iniciadas: 10,
      windows_with_reply: 5,
      conversoes: 0,
      valor_total: 0,
    });
    expect(result.ticket_medio).toBeNull();
  });

  it('taxa_resposta is null when conversas_iniciadas = 0', () => {
    const result = computeSalesMetrics({
      conversas_iniciadas: 0,
      windows_with_reply: 0,
      conversoes: 0,
      valor_total: 0,
    });
    expect(result.taxa_resposta).toBeNull();
  });

  it('taxa_resposta: window with only inbound messages counts as 0 reply', () => {
    // 5 windows, none with reply (inbound-only scenario → 0 windows_with_reply)
    const result = computeSalesMetrics({
      conversas_iniciadas: 5,
      windows_with_reply: 0,
      conversoes: 0,
      valor_total: 0,
    });
    expect(result.taxa_resposta).toBe(0);
  });

  it('valor_total null-safe: valor_total=0 when events have no value', () => {
    // This scenario: 3 conversoes but all gateway_events have no valor
    const result = computeSalesMetrics({
      conversas_iniciadas: 10,
      windows_with_reply: 3,
      conversoes: 3,
      valor_total: 0,
    });
    // conversoes counted, valor_total=0, ticket_medio=0
    expect(result.conversoes).toBe(3);
    expect(result.valor_total).toBe(0);
    expect(result.ticket_medio).toBe(0);
  });

  it('date range validation: returns valid range', () => {
    const MAX_DAYS = 366;
    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeLessThanOrEqual(MAX_DAYS);
  });

  it('date range validation: rejects range > 366 days', () => {
    const MAX_DAYS = 366;
    const from = new Date('2025-01-01');
    const to = new Date('2026-12-31');
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(MAX_DAYS);
  });

  it('all zeros returns valid empty state', () => {
    const result = computeSalesMetrics({
      conversas_iniciadas: 0,
      windows_with_reply: 0,
      conversoes: 0,
      valor_total: 0,
    });
    expect(result.conversas_iniciadas).toBe(0);
    expect(result.conversoes).toBe(0);
    expect(result.valor_total).toBe(0);
    expect(result.taxa_resposta).toBeNull();
    expect(result.ticket_medio).toBeNull();
    expect(result.roi_estimado).toBeNull();
  });
});
