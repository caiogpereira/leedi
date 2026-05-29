'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { forgotPasswordAction } from './actions';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const [state, action, isPending] = useActionState(forgotPasswordAction, {});

  if (state.submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md rounded-lg border p-8 text-center">
          <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
          <p className="text-green-600">{t('successMessage')}</p>
          <p className="mt-6 text-sm text-gray-600">
            <Link href="/login" className="text-indigo-600 hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-lg border p-8">
        <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              {t('emailLabel')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
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
          <p className="text-center text-sm text-gray-600">
            <Link href="/login" className="text-indigo-600 hover:underline">
              {t('backToLogin')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
