// Story 13.5 — pause all in-flight dispatch jobs for a tenant when its number
// quality drops to RED. Self-chaining batches read job.status and abort on
// 'pausado', so flipping the status here halts further sends.

import { withTenant, schema, eq, and, sql } from '@leedi/db';

export async function pauseDispatchesForQuality(tenantId: string): Promise<{ paused: number }> {
  const updated = await withTenant(tenantId, async (tx) =>
    tx
      .update(schema.dispatchJobs)
      .set({
        status: 'pausado',
        configThrottle: sql`${schema.dispatchJobs.configThrottle} || '{"paused_reason":"quality_red"}'::jsonb`,
      })
      .where(
        and(
          eq(schema.dispatchJobs.tenantId, tenantId),
          eq(schema.dispatchJobs.status, 'processando')
        )
      )
      .returning({ id: schema.dispatchJobs.id })
  );
  return { paused: updated.length };
}
