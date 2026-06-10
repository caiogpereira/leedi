export { db } from './client.js';
export * as schema from './schema/index.js';
export type { OnboardingConfig } from './types/onboarding-config.js';
export type {
  TemplateComponentes,
  TemplateVariavel,
  TemplateHeaderComponent,
  TemplateBodyComponent,
  TemplateFooterComponent,
  TemplateButtonComponent,
} from './schema/template.js';
export {
  eq,
  ne,
  sql,
  and,
  or,
  not,
  gte,
  lte,
  gt,
  lt,
  like,
  ilike,
  isNull,
  isNotNull,
  inArray,
  desc,
  asc,
} from 'drizzle-orm';
export type { SQL } from 'drizzle-orm';

import { db, appDb } from './client.js';
import { sql } from 'drizzle-orm';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs fn inside a transaction with app.tenant_id set to tenantId.
 * ALL tenant-scoped reads/writes MUST go through this helper.
 * Uses SET LOCAL so the setting is transaction-scoped (safe with connection pooling).
 *
 * Runs on `appDb` (the RLS-enforced connection when APP_DATABASE_URL points at a
 * NON-BYPASSRLS role — Story 2.4). This is the sanctioned tenant-data path, so RLS
 * is the real safety net here even if a query forgets an explicit tenant filter.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/**
 * Runs fn with app.user_id set — for membership reads BEFORE a tenant is selected
 * (login routing, tenant list). Does NOT set app.tenant_id.
 *
 * Also on `appDb` — the memberships RLS policy permits `user_id = app.user_id`
 * reads, so this works under the non-BYPASSRLS role.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Bypasses tenant RLS. ONLY for workspace admin operations (list-all-tenants, etc.).
 * Every caller MUST be gated behind requireWorkspaceAdmin before using this.
 *
 * Runs on the privileged `db` connection (BYPASSRLS role): the bypass comes from
 * the role, and `SET LOCAL row_security = off` keeps it explicit. This is the
 * deliberate, audited exception to tenant isolation.
 */
export async function withServiceRole<T>(fn: (tx: DbTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL row_security = off`);
    return fn(tx);
  });
}
