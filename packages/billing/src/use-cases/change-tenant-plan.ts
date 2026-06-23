import { withServiceRole, schema, eq, ne, and, desc } from '@leedi/db';
import type { PaymentProvider } from '../ports/payment-provider.js';
import { resolvePlanValue } from './create-billing-for-tenant.js';

export interface ChangeTenantPlanInput {
  tenantId: string;
  novoPlano: 'starter' | 'pro' | 'enterprise';
  /** Required when novoPlano === 'enterprise'. */
  valorEnterprise?: number;
  /** Real workspace UUID of the acting super-admin (for the audit log). */
  workspaceId: string;
  /** The super-admin performing the change. */
  actorUserId: string;
}

export type ChangeTenantPlanResult =
  | { success: true; valor: number }
  | { success: false; error: string };

/**
 * Changes a tenant's plan: updates the Asaas subscription value, then persists
 * the new plano/valor on `subscriptions` and `tenants.plan`, and writes an audit
 * log. The Asaas write happens FIRST so a provider failure aborts before any DB
 * mutation (no drift between our records and Asaas).
 *
 * The new conversation limit for the CURRENT period is applied separately by the
 * caller (apps layer) via `@leedi/usage`, keeping this package free of a
 * usage dependency — mirroring the createTenant → createBilling split.
 *
 * SECURITY: writes across tenants via `withServiceRole`; only call after a
 * `super_admin` re-check.
 */
export async function changeTenantPlan(
  input: ChangeTenantPlanInput,
  provider: PaymentProvider
): Promise<ChangeTenantPlanResult> {
  const { tenantId, novoPlano, valorEnterprise, workspaceId, actorUserId } = input;

  let valor: number;
  try {
    valor = resolvePlanValue(novoPlano, valorEnterprise);
  } catch {
    return { success: false, error: 'Informe o valor mensal para o plano Enterprise' };
  }

  const [sub] = await withServiceRole((tx) =>
    tx
      .select({
        id: schema.subscriptions.id,
        plano: schema.subscriptions.plano,
        asaasSubscriptionId: schema.subscriptions.asaasSubscriptionId,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.tenantId, tenantId),
          ne(schema.subscriptions.status, 'cancelada')
        )
      )
      .orderBy(desc(schema.subscriptions.createdAt))
      .limit(1)
  );

  if (!sub) {
    return {
      success: false,
      error: 'Cliente sem assinatura ativa. Configure a cobrança primeiro.',
    };
  }
  if (!sub.asaasSubscriptionId) {
    return { success: false, error: 'Assinatura sem identificador no Asaas.' };
  }
  if (sub.plano === novoPlano) {
    return { success: false, error: 'O cliente já está neste plano.' };
  }

  // Update Asaas FIRST — abort before touching our DB if the provider rejects.
  await provider.atualizarAssinatura(sub.asaasSubscriptionId, novoPlano, valor);

  await withServiceRole(async (tx) => {
    await tx
      .update(schema.subscriptions)
      .set({ plano: novoPlano, valor: String(valor), updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, sub.id));
    await tx
      .update(schema.tenants)
      .set({ plan: novoPlano })
      .where(eq(schema.tenants.id, tenantId));
    await tx.insert(schema.auditLogs).values({
      workspaceId,
      actorUserId,
      targetTenantId: tenantId,
      acao: 'plan_changed',
      detalhes: { de: sub.plano, para: novoPlano, valor },
    });
  });

  return { success: true, valor };
}
