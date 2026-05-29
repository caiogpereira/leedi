'use server';

import { registerUser } from '@leedi/auth';

export interface RegisterActionState {
  success?: boolean;
  error?: string;
}

export async function registerAction(
  _prev: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> {
  const email = formData.get('email');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    return { error: 'Dados inválidos' };
  }

  if (password !== confirmPassword) {
    return { error: 'As senhas não coincidem' };
  }

  const result = await registerUser({ email, password });
  if (!result.success) {
    return { error: result.error };
  }
  return { success: true };
}
