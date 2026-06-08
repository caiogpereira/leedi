import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, withTenant, schema, eq } from '../index.js';

// Integration tests for agent_configs (Story 7.1).
//
// KNOWN LIMITATION (same as rls.test.ts): the app DATABASE_URL connects as the
// Supabase `postgres` role (rolbypassrls = true), so RLS policies are bypassed and
// the cross-tenant isolation assertion cannot be meaningfully verified here. RLS is
// validated at the DB level via pg_class (relrowsecurity / relforcerowsecurity) when
// the migration is applied. The UNIQUE(tenant_id) constraint and the upsert/PATCH
// roundtrip ARE enforced regardless of role, so those assertions are authoritative.

let workspaceId: string;
let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  const suffix = Date.now();
  const wsRows = await db
    .insert(schema.workspaces)
    .values({ name: `Agent WS ${suffix}` })
    .returning();
  workspaceId = wsRows[0]!.id;

  const taRows = await db
    .insert(schema.tenants)
    .values({ workspaceId, name: 'Agent Tenant A', slug: `agent-ta-${suffix}` })
    .returning();
  const tbRows = await db
    .insert(schema.tenants)
    .values({ workspaceId, name: 'Agent Tenant B', slug: `agent-tb-${suffix}` })
    .returning();
  tenantAId = taRows[0]!.id;
  tenantBId = tbRows[0]!.id;
});

describe('agent_configs', () => {
  it('upserts a default config and reads it back', async () => {
    const inserted = await withTenant(tenantAId, (tx) =>
      tx.insert(schema.agentConfigs).values({ tenantId: tenantAId }).returning()
    );
    expect(inserted[0]!.nomeAgente).toBe('Assistente');
    expect(inserted[0]!.modeloIa).toBe('sonnet');
    expect(inserted[0]!.ativo).toBe(true);
    expect(inserted[0]!.toolsHabilitadas.transferir_humano).toBe(false);
    expect(inserted[0]!.estiloMensagem.tamanho).toBe('medio');
  });

  it('PATCH roundtrip persists field updates', async () => {
    const updated = await withTenant(tenantAId, (tx) =>
      tx
        .update(schema.agentConfigs)
        .set({
          nomeAgente: 'Mari',
          modeloIa: 'haiku',
          toolsHabilitadas: {
            consultar_base_conhecimento: true,
            agendar_followup: false,
            transferir_humano: true,
            adicionar_tag: false,
            solicitar_reengajamento: false,
          },
        })
        .where(eq(schema.agentConfigs.tenantId, tenantAId))
        .returning()
    );
    expect(updated[0]!.nomeAgente).toBe('Mari');
    expect(updated[0]!.modeloIa).toBe('haiku');
    expect(updated[0]!.toolsHabilitadas.transferir_humano).toBe(true);
  });

  it('UNIQUE(tenant_id) rejects a second config for the same tenant', async () => {
    await expect(
      withTenant(tenantAId, (tx) =>
        tx.insert(schema.agentConfigs).values({ tenantId: tenantAId }).returning()
      )
    ).rejects.toThrow();
  });

  it('allows one config per distinct tenant', async () => {
    const inserted = await withTenant(tenantBId, (tx) =>
      tx.insert(schema.agentConfigs).values({ tenantId: tenantBId }).returning()
    );
    expect(inserted[0]!.tenantId).toBe(tenantBId);
  });
});

afterAll(async () => {
  await db.delete(schema.agentConfigs).where(eq(schema.agentConfigs.tenantId, tenantAId));
  await db.delete(schema.agentConfigs).where(eq(schema.agentConfigs.tenantId, tenantBId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantAId));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenantBId));
  await db.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
});
