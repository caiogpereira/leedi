import { withTenant, schema, eq } from '@leedi/db';

export interface ListDispatchTargetsInput {
  tenantId: string;
}

export interface DispatchTarget {
  id: string;
  telefone: string;
  nome: string | null;
}

/**
 * Lists the leads that are eligible to receive an outbound dispatch.
 *
 * This is the LGPD compliance seam: it returns ONLY leads with status 'ativo',
 * which excludes both 'optout' (explicitly opted out) and 'bloqueado' leads.
 * Future dispatch callers MUST source their recipients from here so opt-out is
 * enforced in a single, unit-tested place rather than re-implemented per caller.
 *
 * Runs through withTenant so RLS scopes the read to the caller's tenant.
 */
export async function listDispatchTargets(
  input: ListDispatchTargetsInput
): Promise<DispatchTarget[]> {
  return withTenant(input.tenantId, async (tx) =>
    tx
      .select({
        id: schema.leads.id,
        telefone: schema.leads.telefone,
        nome: schema.leads.nome,
      })
      .from(schema.leads)
      .where(eq(schema.leads.status, 'ativo'))
  );
}
