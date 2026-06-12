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
