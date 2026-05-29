export { db } from './client.js';
export * as schema from './schema/index.js';
export {
  eq,
  sql,
  and,
  or,
  not,
  gte,
  lte,
  gt,
  lt,
  like,
  isNull,
  isNotNull,
  inArray,
} from 'drizzle-orm';

import { db } from './client.js';
import { sql } from 'drizzle-orm';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs fn inside a transaction with app.tenant_id set to tenantId.
 * ALL tenant-scoped reads/writes MUST go through this helper.
 * Uses SET LOCAL so the setting is transaction-scoped (safe with connection pooling).
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs fn with app.user_id set — for membership reads BEFORE a tenant is selected
 * (login routing, tenant list). Does NOT set app.tenant_id.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Bypasses tenant RLS. ONLY for workspace admin operations (list-all-tenants, etc.).
 * Every caller MUST be gated behind requireWorkspaceAdmin before using this.
 */
export async function withServiceRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL row_security = off`);
    return fn(tx);
  });
}
