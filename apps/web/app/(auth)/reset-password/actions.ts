'use server';

import { redirect } from 'next/navigation';
import { resetPassword } from '@leedi/auth';

export interface ResetPasswordState {
  error?: string;
  expired?: boolean;
}

/**
 * Server Action for submitting a new password. `token` is bound from the page's
 * `?token=` search param (provided by Better-Auth's reset-password callback),
 * so it is never trusted from the form body.
 */
export async function resetPasswordAction(
  token: string,
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const newPassword = formData.get('newPassword');
  const confirmPassword = formData.get('confirmPassword');

  if (typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
    return { error: 'Dados inválidos' };
  }
  if (newPassword !== confirmPassword) {
    return { error: 'As senhas não coincidem' };
  }

  const result = await resetPassword(token, newPassword);
  if (!result.success) {
    return { error: result.error, ...(result.expired ? { expired: true } : {}) };
  }

  // redirect() throws internally (NEXT_REDIRECT) — never wrap it in try/catch.
  // AC#2: all sessions are already invalidated by Better-Auth at this point.
  redirect('/login?reset=success');
}
