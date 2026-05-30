'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loginUser } from '@leedi/auth';
import { env } from '@leedi/config';

export interface LoginActionState {
  error?: string;
}

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const email = formData.get('email');
  const password = formData.get('password');
  // Unchecked checkboxes are absent from FormData; presence === checked.
  const rememberMe = formData.get('rememberMe') !== null;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'E-mail ou senha incorretos' };
  }

  const requestHeaders = await headers();
  const result = await loginUser(email, password, { headers: requestHeaders, rememberMe });

  if (!result.success) {
    return { error: result.error };
  }

  // TODO(Story 2.7): if the user belongs to multiple tenants, redirect to a tenant
  // selector. When consuming a `?redirect=` param later, validate it against an
  // allowlist of internal paths to prevent open redirects.
  //
  // NOTE: the dashboard runs on a separate origin (web:3000 vs dashboard:3001).
  // The session cookie is shared across ports on the same host, so auth carries
  // over, but this relative `/dashboard` only resolves correctly once both apps
  // sit behind one origin (reverse proxy) — same assumption as the logout
  // redirect in apps/dashboard/app/actions.ts. Switch to an absolute dashboard
  // URL from env when multi-origin config lands.
  // redirect() throws internally (NEXT_REDIRECT) — never wrap it in try/catch.
  redirect(env.DASHBOARD_URL);
}
