import { z } from 'zod';
import { withTenant, schema, eq, and, isNull, gt } from '@leedi/db';
import { hasPermission } from '@leedi/auth';
import { sendEmail } from '@leedi/notification';
import { env } from '@leedi/config';
import { randomBytes } from 'node:crypto';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'operator', 'viewer']),
  tenantId: z.string().uuid(),
  invitedByUserId: z.string().uuid(),
  inviterRole: z.enum(['owner', 'admin', 'operator', 'viewer']),
});

export type InviteMemberInput = z.infer<typeof inviteSchema>;
export type InviteMemberResult = { success: true } | { success: false; error: string };

const DUPLICATE_INVITE_MESSAGE = 'Já existe um convite pendente para este e-mail';

// Invitation links are valid for 72 hours (AC#1).
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Creates a pending invitation and sends an email to the invitee.
 *
 * Security:
 * - Only owner/admin may invite (team:manage permission).
 * - Admin cannot grant the owner role (privilege escalation guard).
 * - Token is 72-hour, single-use, cryptographically random (32 bytes hex).
 * - A still-valid pending invite for the same (tenant, email) is rejected (AC#3).
 *
 * The DB insert runs inside `withTenant` (tenant-scoped RLS). The email is sent
 * AFTER the transaction commits, so a transient mail failure never rolls back the
 * invite — the invite already exists and the inviter can use "Reenviar".
 */
export async function inviteMember(input: InviteMemberInput): Promise<InviteMemberResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Dados inválidos' };
  }

  const { email, role, tenantId, invitedByUserId, inviterRole } = parsed.data;

  // Authorization: only owner/admin may invite.
  if (!hasPermission(inviterRole, 'team:manage')) {
    return { success: false, error: 'Sem permissão para convidar membros' };
  }

  // Privilege escalation guard: admin cannot grant owner (server-side, not UI-only).
  if (inviterRole === 'admin' && role === 'owner') {
    return {
      success: false,
      error: 'Administradores não podem atribuir o papel de proprietário',
    };
  }

  const created = await withTenant(tenantId, async (tx) => {
    // Reject if a NON-expired, NON-accepted invite already exists for this email.
    const existing = await tx
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          eq(schema.invitations.tenantId, tenantId),
          eq(schema.invitations.email, email),
          isNull(schema.invitations.acceptedAt),
          gt(schema.invitations.expiresAt, new Date())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return { duplicate: true as const };
    }

    // Cryptographically random, single-use token.
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await tx.insert(schema.invitations).values({
      tenantId,
      email,
      role,
      invitedBy: invitedByUserId,
      token,
      expiresAt,
    });

    return { duplicate: false as const, token };
  });

  if (created.duplicate) {
    return { success: false, error: DUPLICATE_INVITE_MESSAGE };
  }

  // Send the invitation email outside the transaction (see doc comment above).
  const acceptUrl = `${env.BETTER_AUTH_URL}/invite/${created.token}`;
  await sendEmail({
    to: email,
    subject: 'Convite para Leedi',
    template: 'invitation',
    data: { acceptUrl, role },
  });

  return { success: true };
}
