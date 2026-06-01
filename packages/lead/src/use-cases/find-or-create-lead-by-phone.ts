import { withTenant, schema, eq, and } from '@leedi/db';

export interface FindOrCreateLeadByPhoneInput {
  tenantId: string;
  telefone: string;
  origem?: string | undefined;
}

export interface FindOrCreateLeadByPhoneResult {
  id: string;
  telefone: string;
  isNew: boolean;
}

const DEFAULT_ORIGEM = 'whatsapp_inbound';

/**
 * Finds a lead by (tenant, telefone) or creates it if missing.
 *
 * Race-safe: the INSERT uses onConflictDoNothing against the unique
 * (tenant_id, telefone) constraint. If a concurrent request created the lead
 * between our SELECT and INSERT, the INSERT returns no row and we re-SELECT to
 * return the winner's id (isNew: false), so two simultaneous inbound messages
 * for a brand-new number never produce a duplicate.
 *
 * All reads/writes run through withTenant so RLS scopes them to the tenant.
 */
export async function findOrCreateLeadByPhone(
  input: FindOrCreateLeadByPhoneInput
): Promise<FindOrCreateLeadByPhoneResult> {
  const { tenantId, telefone } = input;
  const origem = input.origem ?? DEFAULT_ORIGEM;

  return withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: schema.leads.id, telefone: schema.leads.telefone })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
      .limit(1);

    if (existing[0]) {
      return { id: existing[0].id, telefone: existing[0].telefone, isNew: false };
    }

    const now = new Date();
    const inserted = await tx
      .insert(schema.leads)
      .values({
        tenantId,
        telefone,
        status: 'ativo',
        temperatura: 'frio',
        origem,
        primeiraInteracao: now,
        ultimaInteracao: now,
        comprou: false,
        leadRecorrente: false,
        qualificacao: {},
      })
      .onConflictDoNothing()
      .returning({ id: schema.leads.id, telefone: schema.leads.telefone });

    if (inserted[0]) {
      return { id: inserted[0].id, telefone: inserted[0].telefone, isNew: true };
    }

    // Lost the insert race: a concurrent request created the lead. Re-select it.
    const raced = await tx
      .select({ id: schema.leads.id, telefone: schema.leads.telefone })
      .from(schema.leads)
      .where(and(eq(schema.leads.tenantId, tenantId), eq(schema.leads.telefone, telefone)))
      .limit(1);

    return { id: raced[0]!.id, telefone: raced[0]!.telefone, isNew: false };
  });
}
