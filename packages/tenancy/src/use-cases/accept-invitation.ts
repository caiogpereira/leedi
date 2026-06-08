import { db, withTenant, withServiceRole, schema, eq, and, isNull } from '@leedi/db';
import { auth, passwordSchema } from '@leedi/auth';

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
const EMAIL_MISMATCH_MESSAGE =
  'Este convite é para outro e-mail. Saia da conta atual e use o e-mail convidado.';
const SIGNUP_FAILED_MESSAGE = 'Não foi possível criar a conta. Verifique os dados e tente novamente.';

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
 *
 * @param currentUserEmail Email of the currently authenticated user, if any. When
 *   present it MUST match the invited email — a logged-in user may not redeem an
 *   invitation issued to a different address.
 */
export async function acceptInvitation(
  token: string,
  password?: string,
  currentUserEmail?: string
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

  // Binding: an authenticated user can only accept an invite addressed to their
  // own email. Prevents a logged-in user from redeeming a link meant for someone
  // else (case-insensitive compare). New/anonymous invitees pass through.
  if (
    currentUserEmail &&
    currentUserEmail.trim().toLowerCase() !== invite.email.trim().toLowerCase()
  ) {
    return { success: false, error: EMAIL_MISMATCH_MESSAGE };
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
    // Enforce the password policy on this entry point too (the native sign-up
    // hook also enforces it, but a typed message here is clearer than a thrown
    // APIError surfacing as a generic failure).
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedPassword.success) {
      return {
        success: false,
        error: parsedPassword.error.issues[0]?.message ?? 'Senha inválida',
      };
    }
    try {
      const result = await auth.api.signUpEmail({
        body: { email: invite.email, password, name: invite.email },
      });
      // signUpEmail returns `{ token: string | null; user: User }`. The user
      // always exists here.
      userId = result.user.id;
    } catch {
      // Covers weak-password rejection and the USER_ALREADY_EXISTS race (a
      // concurrent accept created the account first). Return a typed error rather
      // than letting the throw escape the Server Action as a 500.
      return { success: false, error: SIGNUP_FAILED_MESSAGE };
    }
  }

  // Create/refresh the membership and mark the invite accepted, in tenant context.
  await withTenant(invite.tenantId, async (tx) => {
    // Re-invite of an existing member: apply the invited role (an upgrade is the
    // intent of re-inviting). onConflictDoUpdate keeps it idempotent on the
    // (user_id, tenant_id) unique index instead of throwing.
    await tx
      .insert(schema.memberships)
      .values({
        userId,
        tenantId: invite.tenantId,
        role: invite.role,
        invitedBy: invite.invitedBy,
      })
      .onConflictDoUpdate({
        target: [schema.memberships.userId, schema.memberships.tenantId],
        set: { role: invite.role, invitedBy: invite.invitedBy },
      });

    // Single-use guard: only mark accepted if still pending. Under a concurrent
    // double-accept the second update matches zero rows (already accepted).
    await tx
      .update(schema.invitations)
      .set({ acceptedAt: new Date() })
      .where(and(eq(schema.invitations.token, token), isNull(schema.invitations.acceptedAt)));
  });

  return { success: true, tenantId: invite.tenantId };
}
