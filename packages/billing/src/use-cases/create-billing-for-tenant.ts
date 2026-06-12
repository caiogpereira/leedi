import { withServiceRole, schema, eq, sql } from '@leedi/db';
import type { PaymentProvider } from '../ports/payment-provider.js';
import { isValidCpfCnpj, normalizeCpfCnpj } from '../lib/cpf-cnpj.js';

const PLAN_VALUES: Record<'starter' | 'pro', number> = {
  starter: 697.0,
  pro: 1497.0,
};

export interface CreateBillingInput {
  tenantId: string;
  nome: string;
  ownerEmail: string;
  plano: 'starter' | 'pro' | 'enterprise';
  /**
   * Tenant CPF (11 digits) or CNPJ (14 digits). REQUIRED by Asaas to create a
   * customer — an Asaas customer cannot be billed without it.
   */
  cpfCnpj: string;
  /** Required when plano === 'enterprise' */
  valorEnterprise?: number;
}

function resolvePlanValue(
  plano: 'starter' | 'pro' | 'enterprise',
  valorEnterprise?: number
): number {
  if (plano === 'enterprise') {
    if (!valorEnterprise) throw new Error('valorEnterprise is required for enterprise plan');
    return valorEnterprise;
  }
  return PLAN_VALUES[plano];
}

async function existingSubscription(tenantId: string): Promise<boolean> {
  const rows = await withServiceRole((tx) =>
    tx
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.tenantId, tenantId))
      .limit(1)
  );
  return rows.length > 0;
}

async function writeAuditLog(tenantId: string, errorMessage: string): Promise<void> {
  await withServiceRole(async (tx) => {
    await tx.insert(schema.auditLogs).values({
      workspaceId: tenantId,
      actorUserId: tenantId,
      targetTenantId: tenantId,
      acao: 'billing_setup_failed',
      detalhes: { error: errorMessage },
    });
    await tx.execute(
      sql`UPDATE "tenants"
          SET "config" = "config" || ${JSON.stringify({ billing_status: 'pendente_configuracao' })}::jsonb
          WHERE "id" = ${tenantId}::uuid`
    );
  });
}

export async function createBillingForTenant(
  input: CreateBillingInput,
  provider: PaymentProvider
): Promise<void> {
  const { tenantId, nome, ownerEmail, plano, valorEnterprise, cpfCnpj } = input;
  const valor = resolvePlanValue(plano, valorEnterprise);

  // Validate the taxpayer id before any side effect — Asaas rejects an invalid
  // cpfCnpj with HTTP 400, so fail fast with a clear error instead.
  if (!isValidCpfCnpj(cpfCnpj)) {
    throw new Error('cpfCnpj inválido: informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido');
  }
  const cpfCnpjNormalized = normalizeCpfCnpj(cpfCnpj);

  // Idempotency: skip if subscription already exists
  if (await existingSubscription(tenantId)) {
    return;
  }

  // Create Asaas customer
  let asaasCustomerId: string;
  try {
    asaasCustomerId = await provider.criarCliente({
      nome,
      email: ownerEmail,
      cpfCnpj: cpfCnpjNormalized,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeAuditLog(tenantId, msg);
    throw err;
  }

  // Create Asaas subscription (must happen AFTER criarCliente)
  let subscriptionId: string;
  let proximoVencimento: Date;
  try {
    const result = await provider.criarAssinatura(asaasCustomerId, plano, valor);
    subscriptionId = result.subscriptionId;
    proximoVencimento = result.proximoVencimento;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeAuditLog(tenantId, msg);
    throw err;
  }

  // Persist subscription row
  await withServiceRole((tx) =>
    tx.insert(schema.subscriptions).values({
      tenantId,
      asaasCustomerId,
      asaasSubscriptionId: subscriptionId,
      plano,
      valor: String(valor),
      ciclo: 'mensal',
      status: 'ativa',
      proximoVencimento: proximoVencimento.toISOString().split('T')[0],
    })
  );
}
