'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { resetPasswordAction, type ResetPasswordState } from './actions';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations('auth.resetPassword');
  // Bind the token (from the URL) so the action never trusts it from the form body.
  const boundAction = resetPasswordAction.bind(null, token);
  const [state, action, isPending] = useActionState<ResetPasswordState, FormData>(
    boundAction,
    {}
  );

  // Token expired while the form sat open (AC#3, secondary path).
  if (state.expired) {
    return (
      <div className="w-full max-w-md rounded-lg border p-8 text-center">
        <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
        <p className="text-red-700">{t('expiredMessage')}</p>
        <p className="mt-6 text-sm text-gray-600">
          <Link href="/forgot-password" className="text-indigo-600 hover:underline">
            {t('requestNewLink')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border p-8">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <form action={action} className="space-y-4">
        {state.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
        )}
        <div>
          <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">
            {t('passwordLabel')}
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium">
            {t('confirmPasswordLabel')}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? '...' : t('submitButton')}
        </button>
      </form>
    </div>
  );
}
