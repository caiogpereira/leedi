'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getSession, getWorkspaceAdmin } from '@leedi/auth';
import {
  createTenant,
  blockTenant,
  unblockTenant,
  getTenantInvoices,
  getTenantFullDetail,
  type TenantInvoice,
} from '@leedi/tenancy';
import { AsaasProvider, createBillingForTenant, isValidCpfCnpj } from '@leedi/billing';
import { env } from '@leedi/config';

/**
 * Server actions backing the super-admin Clientes page (Story 20.2).
 *
 * SECURITY: every action below reaches data ACROSS tenants via `withServiceRole`
 * (RLS bypass), so it MUST re-verify the caller is a `super_admin` workspace admin
 * — the `(shell)/layout.tsx` guard protects the page render but NOT a direct POST
 * to a server action. `requireSuperAdmin` is the gate (defense in depth).
 */
async function requireSuperAdmin(): Promise<{ userId: string; workspaceId: string }> {
  const session = await getSession(await headers());
  if (!session?.user?.id) {
    throw new Error('Não autenticado');
  }
  const admin = await getWorkspaceAdmin(session.user.id);
  if (admin?.role !== 'super_admin') {
    throw new Error('Sem permissão');
  }
  return { userId: session.user.id, workspaceId: admin.workspaceId };
}

const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Nome é obrigatório'),
  ownerEmail: z.string().trim().email('E-mail inválido'),
  // CPF (11 digits) or CNPJ (14 digits) — required by Asaas to create the customer.
  cpfCnpj: z
    .string()
    .trim()
    .refine(isValidCpfCnpj, 'CPF ou CNPJ inválido'),
  plano: z.enum(['starter', 'pro', 'enterprise']),
  // Required only for the enterprise plan (custom monthly value, in BRL).
  valorEnterprise: z.number().positive().optional(),
});

export type CreateTenantActionResult =
  | { ok: true; tenantId: string; billingFailed: boolean }
  | { ok: false; error: string };

export async function createTenantAction(
  input: z.infer<typeof createTenantSchema>
): Promise<CreateTenantActionResult> {
  const { userId, workspaceId } = await requireSuperAdmin();

  const parsed = createTenantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { name, ownerEmail, cpfCnpj, plano, valorEnterprise } = parsed.data;

  if (plano === 'enterprise' && !valorEnterprise) {
    return { ok: false, error: 'Informe o valor mensal para o plano Enterprise' };
  }

  // 1. Create tenant + send owner invitation (Epic 2.6 flow reused inside).
  const created = await createTenant({
    name,
    ownerEmail,
    plano,
    workspaceId,
    invitedByUserId: userId,
  });
  if (!created.success) {
    return { ok: false, error: created.error };
  }

  // 2. Initialise Asaas billing OUTSIDE the creation path. A failure here does NOT
  // roll back the tenant (AC#2): `createBillingForTenant` flags the tenant with
  // `billing_status: 'pendente_configuracao'`, so we just report it.
  let billingFailed = false;
  try {
    const provider = new AsaasProvider(env.ASAAS_API_KEY, env.ASAAS_SANDBOX);
    await createBillingForTenant(
      {
        tenantId: created.tenantId,
        nome: name,
        ownerEmail,
        cpfCnpj,
        plano,
        ...(valorEnterprise !== undefined ? { valorEnterprise } : {}),
      },
      provider
    );
  } catch {
    billingFailed = true;
  }

  revalidatePath('/clientes');
  return { ok: true, tenantId: created.tenantId, billingFailed };
}

const retryBillingSchema = z.object({
  tenantId: z.string().uuid(),
  cpfCnpj: z.string().trim().refine(isValidCpfCnpj, 'CPF ou CNPJ inválido'),
  valorEnterprise: z.number().positive().optional(),
});

export type RetryBillingActionResult = { ok: true } | { ok: false; error: string };

/**
 * Retries Asaas billing setup for a tenant flagged `pendente_configuracao`
 * (Story 17.1 failure path). `createBillingForTenant` is idempotent on the
 * subscription row (`existingSubscription`) and clears the flag on success.
 *
 * cpfCnpj is re-collected because it is never persisted on our side (only sent
 * to Asaas at creation). KNOWN LIMITATION: if the original failure happened
 * AFTER the Asaas customer was created (subscription step failed → no sub row),
 * a retry calls `criarCliente` again and can create a duplicate Asaas customer.
 */
export async function retryBillingAction(
  input: z.infer<typeof retryBillingSchema>
): Promise<RetryBillingActionResult> {
  await requireSuperAdmin();

  const parsed = retryBillingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  const { tenantId, cpfCnpj, valorEnterprise } = parsed.data;

  const detail = await getTenantFullDetail(tenantId);
  if (!detail) {
    return { ok: false, error: 'Cliente não encontrado' };
  }
  if (!detail.ownerEmail) {
    return {
      ok: false,
      error: 'O owner precisa aceitar o convite antes de configurar a cobrança.',
    };
  }
  const plano = detail.plan as 'starter' | 'pro' | 'enterprise';
  if (plano === 'enterprise' && !valorEnterprise) {
    return { ok: false, error: 'Informe o valor mensal para o plano Enterprise' };
  }

  try {
    const provider = new AsaasProvider(env.ASAAS_API_KEY, env.ASAAS_SANDBOX);
    await createBillingForTenant(
      {
        tenantId,
        nome: detail.name,
        ownerEmail: detail.ownerEmail,
        cpfCnpj,
        plano,
        ...(valorEnterprise !== undefined ? { valorEnterprise } : {}),
      },
      provider
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao configurar a cobrança';
    return { ok: false, error: msg };
  }

  revalidatePath('/clientes');
  revalidatePath(`/clientes/${tenantId}`);
  return { ok: true };
}

const blockSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().trim().min(10, 'Informe um motivo (mínimo 10 caracteres)'),
});

export type BlockActionResult = { ok: true } | { ok: false; error: string };

export async function blockTenantAction(
  input: z.infer<typeof blockSchema>
): Promise<BlockActionResult> {
  const { userId, workspaceId } = await requireSuperAdmin();
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  await blockTenant({
    tenantId: parsed.data.tenantId,
    reason: parsed.data.reason,
    workspaceId,
    actorUserId: userId,
  });
  revalidatePath('/clientes');
  return { ok: true };
}

export async function unblockTenantAction(
  input: z.infer<typeof blockSchema>
): Promise<BlockActionResult> {
  const { userId, workspaceId } = await requireSuperAdmin();
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos' };
  }
  await unblockTenant({
    tenantId: parsed.data.tenantId,
    reason: parsed.data.reason,
    workspaceId,
    actorUserId: userId,
  });
  revalidatePath('/clientes');
  return { ok: true };
}

export async function getTenantInvoicesAction(tenantId: string): Promise<TenantInvoice[]> {
  await requireSuperAdmin();
  if (!z.string().uuid().safeParse(tenantId).success) {
    return [];
  }
  return getTenantInvoices(tenantId);
}
