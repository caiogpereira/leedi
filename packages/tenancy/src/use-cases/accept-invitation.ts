import { db, withTenant, withServiceRole, schema, eq, and, isNull } from '@leedi/db';
import { auth } from '@leedi/auth';

export interface InvitationView {
  email: string;
  role: 'owner' | 'admin' | 'operator' | 'viewer';
  /** True when no account exists yet for the invited email (password required). */
  isNewUser: boolean;
}

export type GetInvitationResult =
  | { valid: true; expired: false; invitation: InvitationView }
  | { valid: false; expired: boolean };

export type AcceptInvitationResult =
  | { success: true; tenantId: string }
  | { success: false; error: string };

const INVALID_MESSAGE = 'Convite inválido ou já utilizado';
const EXPIRED_MESSAGE = 'Este convite expirou. Solicite um novo ao administrador.';
const PASSWORD_REQUIRED_MESSAGE = 'Senha obrigatória para novos usuários';

/**
 * Read-only lookup used by the accept page to decide what to render:
 * an "accept" button (existing account) vs a "set password" form (new user),
 * or an expired/invalid state — mirroring the reset-password page pattern.
 *
 * Runs under `withServiceRole` because the tenant is unknown at link-open time,
 * so RLS (which scopes by app.tenant_id) cannot be used to find the row.
 */
export async function getInvitation(token: string): Promise<GetInvitationResult> {
  const [invite] = await withServiceRole(async (tx) =>
    tx
      .select()
      .from(schema.invitations)
      .where(and(eq(schema.invitations.token, token), isNull(schema.invitations.acceptedAt)))
      .limit(1)
  );

  if (!invite) {
    return { valid: false, expired: false };
  }
  if (invite.expiresAt < new Date()) {
    return { valid: false, expired: true };
  }

  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, invite.email))
    .limit(1);

  return {
    valid: true,
    expired: false,
    invitation: {
      email: invite.email,
      role: invite.role,
      isNewUser: !existingUser,
    },
  };
}

/**
 * Accepts a pending invitation, creating a membership for the invitee.
 *
 * Security:
 * - Token is RE-VERIFIED at accept time (expiry + not-yet-accepted), not only at
 *   page load — the link may sit open past expiry, or be replayed.
 * - Existing account → only a membership is created.
 * - New account → created via Better-Auth (sends its own verification email via
 *   `emailVerification.sendOnSignUp`), then the membership is created.
 *
 * NOTE (AC#2 — deferred): this does NOT establish a session. New users have no
 * password-less sign-in path and existing users' passwords are unknown here, so
 * auto-session-on-accept is intentionally out of scope (tracked with the
 * tenant/role session work in Story 2.7). The caller redirects to /login.
 */
export async function acceptInvitation(
  token: string,
  password?: string
): Promise<AcceptInvitationResult> {
  // Tenant is unknown until the row is read, so bypass RLS for the token lookup.
  const [invite] = await withServiceRole(async (tx) =>
    tx
      .select()
      .from(schema.invitations)
      .where(and(eq(schema.invitations.token, token), isNull(schema.invitations.acceptedAt)))
      .limit(1)
  );

  if (!invite) {
    return { success: false, error: INVALID_MESSAGE };
  }

  if (invite.expiresAt < new Date()) {
    return { success: false, error: EXPIRED_MESSAGE };
  }

  // Resolve the user: reuse an existing account or create a new one.
  const [existingUser] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, invite.email))
    .limit(1);

  let userId: string;

  if (existingUser) {
    userId = existingUser.id;
  } else {
    if (!password) {
      return { success: false, error: PASSWORD_REQUIRED_MESSAGE };
    }
    const result = await auth.api.signUpEmail({
      body: { email: invite.email, password, name: invite.email },
    });
    // signUpEmail returns `{ token: string | null; user: User }` (verified against
    // the better-auth route types). The user always exists here.
    userId = result.user.id;
  }

  // Create the membership and mark the invite accepted, within the tenant context.
  await withTenant(invite.tenantId, async (tx) => {
    // onConflictDoNothing: if the user is already a member of this tenant (re-invite
    // of an existing member), the (user_id, tenant_id) unique index would throw —
    // accept idempotently instead of crashing.
    await tx
      .insert(schema.memberships)
      .values({
        userId,
        tenantId: invite.tenantId,
        role: invite.role,
        invitedBy: invite.invitedBy,
      })
      .onConflictDoNothing({
        target: [schema.memberships.userId, schema.memberships.tenantId],
      });

    await tx
      .update(schema.invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(schema.invitations.token, token));
  });

  return { success: true, tenantId: invite.tenantId };
}
