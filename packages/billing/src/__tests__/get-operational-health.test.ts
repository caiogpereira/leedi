import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

// sql tag mocked to interpolate so tests can assert on the SQL contract
// (PT-BR enum literals, table name — the enum-trap guard).
vi.mock('@leedi/db', () => ({
  withServiceRole: vi.fn((fn: (tx: unknown) => unknown) => fn({ execute: mockExecute })),
  schema: {},
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    let result = '';
    strings.forEach((s, i) => {
      result += s;
      if (i < values.length) result += String(values[i]);
    });
    return result;
  }),
}));

import {
  getOperationalHealth,
  computeMarginPct,
  NEAR_LIMIT_THRESHOLD,
} from '../use-cases/get-operational-health.js';

describe('computeMarginPct', () => {
  it('computes (MRR - AI_cost_BRL) / MRR * 100', () => {
    // 10000 BRL MRR, 500 USD * 5.0 = 2500 BRL cost → (10000-2500)/10000 = 75%
    expect(computeMarginPct(10000, 500, 5.0)).toBe(75);
  });

  it('returns 0 when MRR is 0 (no divide-by-zero / NaN)', () => {
    expect(computeMarginPct(0, 500, 5.0)).toBe(0);
  });
});

describe('getOperationalHealth', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  // Query order in the use-case: 1) usage 2) tenants 3) subscriptions 4) near-limit 5) quality
  function prime(opts?: {
    usage?: Record<string, unknown>;
    tenants?: Record<string, unknown>;
    subs?: Record<string, unknown>;
    nearLimit?: Record<string, unknown>[];
    quality?: Record<string, unknown>[];
  }) {
    mockExecute.mockResolvedValueOnce([
      opts?.usage ?? { total_conversas: '1500', total_ai_cost_usd: '500' },
    ]);
    mockExecute.mockResolvedValueOnce([opts?.tenants ?? { new_tenants: '3' }]);
    mockExecute.mockResolvedValueOnce([opts?.subs ?? { mrr: '10000', churn: '1' }]);
    mockExecute.mockResolvedValueOnce(opts?.nearLimit ?? []);
    mockExecute.mockResolvedValueOnce(opts?.quality ?? []);
  }

  it('aggregates KPIs and computes margin + net growth', async () => {
    prime();
    const result = await getOperationalHealth(5.0);

    expect(result.totalConversas).toBe(1500);
    expect(result.totalAiCostUsd).toBe(500);
    expect(result.marginPct).toBe(75); // (10000 - 500*5) / 10000 * 100
    expect(result.newTenantsThisMonth).toBe(3);
    expect(result.churnThisMonth).toBe(1);
    expect(result.netGrowth).toBe(2); // 3 - 1
    expect(result.usdToBrlRate).toBe(5.0);
  });

  it('reports negative net growth when churn exceeds new tenants', async () => {
    prime({ tenants: { new_tenants: '1' }, subs: { mrr: '10000', churn: '4' } });
    const result = await getOperationalHealth(5.0);
    expect(result.netGrowth).toBe(-3);
  });

  it('maps near-limit tenants (usage %, owner email for the CTA)', async () => {
    prime({
      nearLimit: [
        {
          tenant_id: 't-1',
          tenant_name: 'Acme',
          plano: 'pro',
          conversas_usadas: '900',
          conversas_limite: '1000',
          usage_pct: '90.0',
          owner_email: 'owner@acme.com',
        },
      ],
    });
    const result = await getOperationalHealth(5.0);
    expect(result.nearLimitTenants[0]).toEqual({
      tenantId: 't-1',
      tenantName: 'Acme',
      plano: 'pro',
      conversasUsadas: 900,
      conversasLimite: 1000,
      usagePct: 90,
      ownerEmail: 'owner@acme.com',
    });
  });

  it('maps quality-risk tenants with days at risk', async () => {
    prime({
      quality: [
        { tenant_id: 't-2', tenant_name: 'Beta', quality_rating: 'vermelho', days_at_risk: '3' },
      ],
    });
    const result = await getOperationalHealth(5.0);
    expect(result.qualityRiskTenants[0]).toEqual({
      tenantId: 't-2',
      tenantName: 'Beta',
      qualityRating: 'vermelho',
      daysAtRisk: 3,
    });
  });

  it('uses the PT-BR quality enum and whatsapp_connections table (enum-trap guard)', async () => {
    prime();
    await getOperationalHealth(5.0);
    // 5th execute call is the quality-risk query.
    const qualitySql = mockExecute.mock.calls[4]?.[0] as string;
    expect(qualitySql).toContain('whatsapp_connections');
    expect(qualitySql).toContain("'amarelo'");
    expect(qualitySql).toContain("'vermelho'");
    expect(qualitySql).toContain("status = 'conectado'");
    // Must NOT use the English values from the story text.
    expect(qualitySql).not.toContain("'yellow'");
    expect(qualitySql).not.toContain("'red'");
  });

  it('applies the 80% near-limit threshold constant in the SQL', async () => {
    prime();
    await getOperationalHealth(5.0);
    const nearLimitSql = mockExecute.mock.calls[3]?.[0] as string;
    expect(NEAR_LIMIT_THRESHOLD).toBe(0.8);
    expect(nearLimitSql).toContain('0.8');
  });
});
