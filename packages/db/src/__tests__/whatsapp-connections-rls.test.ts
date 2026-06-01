import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, withTenant, withServiceRole, schema, eq } from '../index.js';

// Integration test — requires a running Supabase with migration 0003 applied.
//
// KNOWN LIMITATION: The current DATABASE_URL connects as the Supabase `postgres` role,
// which has rolbypassrls = true. A BYPASSRLS role IGNORES all RLS policies regardless
// of ENABLE/FORCE ROW LEVEL SECURITY. As a result, cross-tenant isolation tests
// return ALL rows and will FAIL with this connection.
//
// The RLS policy correctness is verified separately via pg_class / pg_policies.
// These tests become meaningful when DATABASE_URL targets a non-BYPASSRLS app role.

let workspaceId: string;
let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ name: `WS RLS Test ${suffix}` })
    .returning();
  workspaceId = ws!.id;

  const [ta] = await db
    .insert(schema.tenants)
    .values({ workspaceId, name: 'WA Tenant A', slug: `wa-ta-${suffix}` })
    .returning();
  const [tb] = await db
    .insert(schema.tenants)
    .values({ workspaceId, name: 'WA Tenant B', slug: `wa-tb-${suffix}` })
    .returning();
  tenantAId = ta!.id;
  tenantBId = tb!.id;

  // Insert one connection per tenant via service role (RLS bypass for setup)
  await withServiceRole(async (tx) => {
    await tx.insert(schema.whatsappConnections).values({
      tenantId: tenantAId,
      phoneNumberId: 'pn_A',
      wabaId: 'waba_A',
      accessTokenEncrypted: 'enc_A',
      accessTokenIv: 'iv_A',
    });
    await tx.insert(schema.whatsappConnections).values({
      tenantId: tenantBId,
      phoneNumberId: 'pn_B',
      wabaId: 'waba_B',
      accessTokenEncrypted: 'enc_B',
      accessTokenIv: 'iv_B',
    });
  });
});

describe('whatsapp_connections RLS isolation', () => {
  it('withTenant(A): sees only tenant A connection', async () => {
    const rows = await withTenant(tenantAId, (tx) =>
      tx.select().from(schema.whatsappConnections)
    );
    expect(rows.every((r) => r.tenantId === tenantAId)).toBe(true);
  });

  it('withTenant(A): cross-tenant filter for B returns zero rows', async () => {
    const rows = await withTenant(tenantAId, (tx) =>
      tx
        .select()
        .from(schema.whatsappConnections)
        .where(eq(schema.whatsappConnections.tenantId, tenantBId))
    );
    expect(rows).toHaveLength(0);
  });
});

afterAll(async () => {
  await withServiceRole(async (tx) => {
    await tx
      .delete(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantAId));
    await tx
      .delete(schema.whatsappConnections)
      .where(eq(schema.whatsappConnections.tenantId, tenantBId));
  });
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantAId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantBId));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
});
