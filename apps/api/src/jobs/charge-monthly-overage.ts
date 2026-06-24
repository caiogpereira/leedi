// Monthly overage billing (automatic excedente charge).
//
// Cron: daily; targets the PREVIOUS calendar month so a transient failure retries
// across the early days of the month (once charged, `overage_cobrado_em` makes it
// a no-op). Each tenant with accumulated overage for the closed period gets a
// one-off Asaas cobrança (boleto). The resulting `invoices` row carries the Asaas
// payment id, so the existing Asaas webhook (process-billing-event) updates the
// SAME row to `pago` when the customer pays.
//
// Double-charge guards (this is money): charge FIRST then mark `overage_cobrado_em`;
// the Asaas charge carries externalReference=`overage:{tenantId}:{periodo}` as a
// reconciliation handle; and the invoice asaas_payment_id is UNIQUE.

import { withServiceRole, sql } from '@leedi/db';
import { MIN_OVERAGE_CHARGE_BRL } from '@leedi/usage';
import { captureException } from '@leedi/observability';
import type { PaymentProvider } from '@leedi/billing';

interface OverdueOverageRow {
  [key: string]: unknown;
  tenantId: string;
  tenantName: string;
  periodo: string;
  overageValor: string;
  conversasLimite: number;
  asaasCustomerId: string | null;
}

export interface ChargeOverageResult {
  /** Rows considered for the period. */
  considered: number;
  /** Charges actually issued at Asaas. */
  charged: number;
  /** Periods below the minimum, rolled into the next month instead of charged. */
  carriedForward: number;
  /** Skipped because the tenant has no Asaas customer. */
  skippedNoCustomer: number;
}

/** Previous calendar month as 'YYYY-MM'. */
export function previousPeriod(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

/** The calendar month after a 'YYYY-MM' string, as 'YYYY-MM'. */
export function nextPeriodOf(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m!, 1)); // m is 1-based; Date month is 0-based → m == next month
  return d.toISOString().slice(0, 7);
}

/** Due date (YYYY-MM-DD) `days` from now. */
function dueDateIn(days: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export interface ChargeOverageOptions {
  /** Restrict to a single tenant (used for the single-shot live test). */
  tenantId?: string;
  /** Override the target period (defaults to the previous calendar month). */
  periodo?: string;
}

/**
 * Charges accumulated conversation overage for the closed period. Idempotent via
 * `usage_counters.overage_cobrado_em` (only NULL rows are processed) + the UNIQUE
 * invoice.asaas_payment_id. SECURITY: cross-tenant via `withServiceRole`; reached
 * only behind the QStash-verified internal route.
 */
export async function chargeMonthlyOverage(
  provider: PaymentProvider,
  opts: ChargeOverageOptions = {}
): Promise<ChargeOverageResult> {
  const periodo = opts.periodo ?? previousPeriod();
  const result: ChargeOverageResult = {
    considered: 0,
    charged: 0,
    carriedForward: 0,
    skippedNoCustomer: 0,
  };

  const rows = await withServiceRole((tx) =>
    tx.execute<OverdueOverageRow>(sql`
      SELECT
        uc.tenant_id AS "tenantId",
        t.name AS "tenantName",
        uc.periodo AS periodo,
        uc.overage_valor AS "overageValor",
        uc.conversas_limite AS "conversasLimite",
        s.asaas_customer_id AS "asaasCustomerId"
      FROM usage_counters uc
      JOIN tenants t ON t.id = uc.tenant_id
      LEFT JOIN LATERAL (
        SELECT asaas_customer_id
        FROM subscriptions
        WHERE tenant_id = uc.tenant_id AND status != 'cancelada'
        ORDER BY created_at DESC
        LIMIT 1
      ) s ON true
      WHERE uc.periodo = ${periodo}
        AND uc.overage_valor > 0
        AND uc.overage_cobrado_em IS NULL
        ${opts.tenantId ? sql`AND uc.tenant_id = ${opts.tenantId}::uuid` : sql``}
    `)
  );

  const list: OverdueOverageRow[] = Array.isArray(rows)
    ? (rows as unknown as OverdueOverageRow[])
    : ((rows as unknown as { rows?: OverdueOverageRow[] }).rows ?? []);

  for (const row of list) {
    result.considered += 1;
    const valor = Math.round(parseFloat(row.overageValor) * 100) / 100;

    try {
      // Below the minimum: don't charge (Asaas rejects sub-R$5 boletos). Roll the
      // amount into the NEXT month's counter so it accumulates until it crosses the
      // threshold and gets billed — then mark this period processed so it is not
      // re-carried on the next run.
      if (valor < MIN_OVERAGE_CHARGE_BRL) {
        await carryForward(row.tenantId, row.periodo, valor, row.conversasLimite);
        result.carriedForward += 1;
        continue;
      }

      if (!row.asaasCustomerId) {
        // No Asaas customer to bill — leave unmarked (visible) and skip.
        console.warn(
          `[overage] tenant ${row.tenantId} has overage R$${valor} for ${row.periodo} but no Asaas customer; skipping`
        );
        result.skippedNoCustomer += 1;
        continue;
      }

      // Charge FIRST, then materialise the invoice, then mark — so a mid-failure
      // never marks a period charged without a real charge behind it.
      const charge = await provider.criarCobrancaAvulsa({
        customerId: row.asaasCustomerId,
        valor,
        descricao: `Excedente de conversas — ${row.periodo}`,
        vencimento: dueDateIn(7),
        externalReference: `overage:${row.tenantId}:${row.periodo}`,
      });

      await withServiceRole((tx) =>
        tx.execute(sql`
          INSERT INTO "invoices"
            ("tenant_id", "asaas_payment_id", "valor", "vencimento", "status",
             "inclui_overage", "valor_overage", "receipt_url")
          VALUES (
            ${row.tenantId}::uuid,
            ${charge.paymentId},
            ${String(valor)}::numeric,
            ${charge.vencimento}::date,
            'pendente'::invoice_status_enum,
            true,
            '0'::numeric,
            ${charge.invoiceUrl}
          )
          ON CONFLICT ("asaas_payment_id") WHERE "asaas_payment_id" IS NOT NULL DO NOTHING
        `)
      );

      await markCharged(row.tenantId, row.periodo);
      result.charged += 1;
    } catch (err) {
      // Per-tenant isolation: a failure here leaves overage_cobrado_em NULL so the
      // next daily run retries it. Never throws out of the loop.
      captureException(err as Error);
    }
  }

  return result;
}

async function markCharged(tenantId: string, periodo: string): Promise<void> {
  await withServiceRole((tx) =>
    tx.execute(sql`
      UPDATE "usage_counters"
      SET "overage_cobrado_em" = now()
      WHERE "tenant_id" = ${tenantId}::uuid AND "periodo" = ${periodo}
    `)
  );
}

/**
 * Rolls a below-minimum overage into the next month's counter (creating it if
 * needed), then marks the source period processed. Both run in one service-role
 * tx so a partial carry can't drop money.
 */
async function carryForward(
  tenantId: string,
  periodo: string,
  valor: number,
  conversasLimite: number
): Promise<void> {
  const next = nextPeriodOf(periodo);
  await withServiceRole(async (tx) => {
    await tx.execute(sql`
      INSERT INTO "usage_counters"
        ("tenant_id", "periodo", "conversas_usadas", "conversas_limite", "overage_valor", "updated_at")
      VALUES (${tenantId}::uuid, ${next}, 0, ${conversasLimite}, ${String(valor)}::numeric, now())
      ON CONFLICT ("tenant_id", "periodo") DO UPDATE SET
        "overage_valor" = "usage_counters"."overage_valor" + ${String(valor)}::numeric,
        "updated_at" = now()
    `);
    await tx.execute(sql`
      UPDATE "usage_counters"
      SET "overage_cobrado_em" = now()
      WHERE "tenant_id" = ${tenantId}::uuid AND "periodo" = ${periodo}
    `);
  });
}
