'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginUser } from '@leedi/auth';

export interface LoginActionState {
  error?: string;
}

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'E-mail ou senha incorretos' };
  }

  const requestHeaders = await headers();
  const result = await loginUser(email, password, requestHeaders);

  if (!result.success) {
    return { error: result.error };
  }

  // TODO(Story 2.7): if the user belongs to multiple tenants, redirect to a tenant
  // selector. When consuming a `?redirect=` param later, validate it against an
  // allowlist of internal paths to prevent open redirects. For now always go to
  // the dashboard.
  // NOTE: redirect() throws internally (NEXT_REDIRECT) — never wrap it in try/catch.
  redirect('/dashboard');
}
