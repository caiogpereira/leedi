// Daily billing lockdown check (Story 17.2, AC #4, #5).
// Cron: '0 12 * * *' UTC (09:00 BRT). Registered in QStash.
// Finds overdue invoices and blocks tenants after 3 or 7 days.

import { withServiceRole, schema, sql } from '@leedi/db';
import { sendNotificationToTenantRole } from '@leedi/notification';
import { captureException } from '@leedi/observability';

interface OverdueRow {
  invoiceId: string;
  tenantId: string;
  vencimento: string;
  tenantStatus: string;
}

export async function runDailyBillingCheck(): Promise<{
  checked: number;
  blocked: number;
}> {
  const now = new Date();
  let blocked = 0;

  const overdueRows = await withServiceRole((tx) =>
    tx.execute<OverdueRow>(
      sql`SELECT
            i.id AS "invoiceId",
            i.tenant_id AS "tenantId",
            i.vencimento::text AS vencimento,
            t.status AS "tenantStatus"
          FROM invoices i
          JOIN tenants t ON t.id = i.tenant_id
          WHERE i.status = 'atrasado'
            AND i.vencimento <= now()
          ORDER BY i.vencimento ASC`
    )
  );

  const rows = (overdueRows as unknown as { rows: OverdueRow[] }).rows ?? [];

  for (const row of rows) {
    try {
      const dueDate = new Date(row.vencimento);
      const daysOverdue = Math.floor(
        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (row.tenantStatus === 'blocked') {
        // Already fully blocked — skip both thresholds
        continue;
      }

      if (daysOverdue >= 7) {
        // Full block
        await withServiceRole((tx) =>
          tx.execute(
            sql`UPDATE tenants SET status = 'blocked' WHERE id = ${row.tenantId}::uuid AND status != 'blocked'`
          )
        );
        await sendNotificationToTenantRole({
          tenantId: row.tenantId,
          roles: ['owner'],
          tipo: 'conta_bloqueada',
          titulo: 'Conta suspensa por inadimplência',
          corpo: 'Seus dados estão preservados. Regularize para reativar.',
        });
        blocked += 1;
      } else if (daysOverdue >= 3) {
        // Partial block — disable sending features (same status value as full block for now)
        await withServiceRole((tx) =>
          tx.execute(
            sql`UPDATE tenants SET status = 'blocked' WHERE id = ${row.tenantId}::uuid AND status != 'blocked'`
          )
        );
        await sendNotificationToTenantRole({
          tenantId: row.tenantId,
          roles: ['owner'],
          tipo: 'conta_bloqueada',
          titulo: 'Pagamento atrasado',
          corpo: 'Regularize para continuar enviando mensagens.',
        });
        blocked += 1;
      }
    } catch (err) {
      captureException(err as Error);
    }
  }

  return { checked: rows.length, blocked };
}
