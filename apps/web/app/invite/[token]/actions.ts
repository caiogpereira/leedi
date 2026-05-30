'use server';

import { redirect } from 'next/navigation';
import { acceptInvitation } from '@leedi/tenancy';

export interface AcceptInviteState {
  error?: string;
}

/**
 * Server Action for accepting an invitation. `token` is bound from the page's
 * route param, so it is never trusted from the form body. For new users the form
 * supplies a password; existing users submit no password.
 *
 * AC#2 (deferred): accept does not establish a session today — there is no
 * password-less sign-in for existing invitees and the dashboard middleware would
 * bounce a session-less user from /dashboard. We redirect to /login so the user
 * authenticates, rather than silently looping through middleware. Auto-session on
 * accept is tracked with the tenant/role session work in Story 2.7.
 */
export async function acceptInviteAction(
  token: string,
  _prev: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const password = formData.get('password');
  const result = await acceptInvitation(
    token,
    typeof password === 'string' && password ? password : undefined
  );

  if (!result.success) {
    return { error: result.error };
  }

  // redirect() throws internally (NEXT_REDIRECT) — never wrap it in try/catch.
  redirect('/login?invited=success');
}
