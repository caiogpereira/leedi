import { withServiceRole, sql } from '@leedi/db';

export interface TenantInvoice {
  id: string;
  valor: number | null;
  valorOverage: number;
  vencimento: string | null;
  pagoEm: Date | null;
  status: string;
  asaasPaymentId: string | null;
  createdAt: Date;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNumber(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}

function toNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Returns the last 12 invoices for a tenant (Story 20.2 Task 7 / FR138) for the
 * per-tenant financial-history panel on the admin Clientes page.
 *
 * An empty array is a valid result for a brand-new tenant (not an error).
 *
 * SECURITY: reads a single tenant's invoices via `withServiceRole` (RLS bypass);
 * only reachable behind the workspace-admin guard.
 */
export async function getTenantInvoices(tenantId: string): Promise<TenantInvoice[]> {
  return withServiceRole(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT
        id,
        valor,
        valor_overage,
        vencimento,
        pago_em,
        status,
        asaas_payment_id,
        created_at
      FROM invoices
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at DESC
      LIMIT 12
    `)) as Array<{
      id: string;
      valor: unknown;
      valor_overage: unknown;
      vencimento: unknown;
      pago_em: unknown;
      status: string;
      asaas_payment_id: string | null;
      created_at: unknown;
    }>;

    return rows.map((row) => ({
      id: row.id,
      valor: toNullableNumber(row.valor),
      valorOverage: toNumber(row.valor_overage),
      vencimento: row.vencimento ? String(row.vencimento) : null,
      pagoEm: toNullableDate(row.pago_em),
      status: row.status,
      asaasPaymentId: row.asaas_payment_id ?? null,
      createdAt: new Date(row.created_at as string),
    }));
  });
}
