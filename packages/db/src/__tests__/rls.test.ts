import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, withTenant, withUser, schema, eq } from '../index.js';

// NOTE: These tests require a real Supabase/Postgres connection.
//
// KNOWN LIMITATION (Story 2.4): The current DATABASE_URL connects as the Supabase
// `postgres` role, which has rolbypassrls = true. A BYPASSRLS role IGNORES all RLS
// policies regardless of ENABLE/FORCE ROW LEVEL SECURITY. As a result:
//   - beforeAll inserts succeed (RLS bypassed, no app.tenant_id needed)
//   - "withTenant" isolation assertions return ALL rows, so the cross-tenant
//     isolation tests FAIL when run against this connection.
//
// This is EXPECTED and documented. The tests are kept ACTIVE (not skipped) on
// purpose: when DATABASE_URL is pointed at a dedicated non-BYPASSRLS application
// role (e.g. `leedi_app`), these tests become meaningful and will catch any RLS
// regression. The RLS policies themselves are verified at the DB level via
// pg_policies / pg_class (relrowsecurity, relforcerowsecurity) during migration.
//
// Proper full validation also requires rewriting beforeAll to insert RLS-subject
// rows via a service-role bypass (since the tenant_isolation policy denies INSERT
// when app.tenant_id is unset under a non-BYPASSRLS role). That role provisioning
// is an out-of-scope manual action flagged in the Epic 2 plan.

let workspaceId: string;
let tenantAId: string;
let tenantBId: string;
let userAId: string;
let userBId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: `Test WS ${suffix}` })
    .returning();
  workspaceId = ws.id;

  const [ta] = await db
    .insert(schema.tenants)
    .values({
      workspaceId,
      name: 'Tenant A',
      slug: `ta-${suffix}`,
    })
    .returning();
  const [tb] = await db
    .insert(schema.tenants)
    .values({
      workspaceId,
      name: 'Tenant B',
      slug: `tb-${suffix}`,
    })
    .returning();
  tenantAId = ta.id;
  tenantBId = tb.id;

  const [ua] = await db
    .insert(schema.users)
    .values({
      email: `ua-${suffix}@test.com`,
      passwordHash: 'hash',
    })
    .returning();
  const [ub] = await db
    .insert(schema.users)
    .values({
      email: `ub-${suffix}@test.com`,
      passwordHash: 'hash',
    })
    .returning();
  userAId = ua.id;
  userBId = ub.id;

  await db
    .insert(schema.memberships)
    .values({ userId: userAId, tenantId: tenantAId, role: 'owner' });
  await db
    .insert(schema.memberships)
    .values({ userId: userBId, tenantId: tenantBId, role: 'owner' });
});

describe('RLS tenant isolation', () => {
  it('withTenant: returns own tenant row only', async () => {
    const rows = await withTenant(tenantAId, (tx) => tx.select().from(schema.tenants));
    expect(rows.every((r) => r.id === tenantAId)).toBe(true);
  });

  it('withTenant: cross-tenant filter returns zero rows (RLS overrides)', async () => {
    const rows = await withTenant(tenantAId, (tx) =>
      tx.select().from(schema.memberships).where(eq(schema.memberships.tenantId, tenantBId))
    );
    expect(rows).toHaveLength(0);
  });

  it('withUser: lists memberships for the user before tenant is selected', async () => {
    const rows = await withUser(userAId, (tx) =>
      tx.select().from(schema.memberships).where(eq(schema.memberships.userId, userAId))
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId === userAId)).toBe(true);
  });
});

afterAll(async () => {
  await db.delete(schema.memberships).where(eq(schema.memberships.tenantId, tenantAId));
  await db.delete(schema.memberships).where(eq(schema.memberships.tenantId, tenantBId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantAId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantBId));
  await db.delete(schema.users).where(eq(schema.users.id, userAId));
  await db.delete(schema.users).where(eq(schema.users.id, userBId));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
});
