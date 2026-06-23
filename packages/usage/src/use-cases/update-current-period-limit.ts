import { withServiceRole, sql } from '@leedi/db';
import { PLAN_LIMITS } from '../constants.js';
import { currentPeriod } from './increment-usage.js';

/**
 * Applies a plan's conversation limit to the CURRENT period's usage_counters row
 * immediately (used after a super-admin plan change). `incrementUsage` reads the
 * plan limit fresh on insert but its ON CONFLICT path never rewrites
 * conversas_limite, so without this an upgrade/downgrade would only take effect
 * next month. No-op when no counter row exists yet for the period (the next
 * increment then creates it with the new plan's limit).
 *
 * SECURITY: cross-tenant write via `withServiceRole`; only call after a
 * super_admin re-check (it has no tenant scope of its own).
 */
export async function updateCurrentPeriodLimit(tenantId: string, plano: string): Promise<void> {
  const limite = PLAN_LIMITS[plano] ?? PLAN_LIMITS['starter']!;
  await withServiceRole((tx) =>
    tx.execute(sql`
      UPDATE "usage_counters"
      SET "conversas_limite" = ${limite}, "updated_at" = now()
      WHERE "tenant_id" = ${tenantId}::uuid AND "periodo" = ${currentPeriod()}
    `)
  );
}
