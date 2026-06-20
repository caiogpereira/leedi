"use server";

import { revalidatePath } from "next/cache";
import { inviteMember } from "@leedi/tenancy";
import { getCurrentTenantContext } from "../../../../lib/tenant-context";

export interface InviteState {
  error?: string;
  success?: boolean;
}

/**
 * Server Action that creates a team invitation (Story 2.6 AC#1/AC#3).
 *
 * Authorization and tenant scope are resolved SERVER-SIDE from the membership-backed
 * context — the form never supplies the tenantId or the inviter's role, so neither can
 * be tampered with. `inviteMember` re-checks `team:manage` and the admin→owner
 * escalation guard, so this is defense in depth, not the only boundary.
 */
export async function inviteAction(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { error: "Sessão expirada. Faça login novamente." };
  }

  const email = formData.get("email");
  const role = formData.get("role");
  if (typeof email !== "string" || typeof role !== "string") {
    return { error: "Dados inválidos" };
  }

  const result = await inviteMember({
    email,
    role: role as "owner" | "admin" | "operator" | "viewer",
    tenantId: ctx.tenant.tenantId,
    invitedByUserId: ctx.userId,
    inviterRole: ctx.role,
  });

  if (!result.success) {
    return { error: result.error };
  }
  // Refresh the team page so the new invite shows up in the "Pendente" list.
  revalidatePath("/configuracoes/equipe");
  return { success: true };
}
