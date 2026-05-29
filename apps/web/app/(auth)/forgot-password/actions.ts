'use server';

import { headers } from 'next/headers';
import { requestPasswordReset } from '@leedi/auth';

export interface ForgotPasswordState {
  submitted?: boolean;
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = formData.get('email');
  if (typeof email === 'string' && email) {
    const requestHeaders = await headers();
    await requestPasswordReset(email, requestHeaders);
  }
  // Always return submitted=true — anti-enumeration (AC#1). The success view is
  // identical whether or not the email is registered.
  return { submitted: true };
}
