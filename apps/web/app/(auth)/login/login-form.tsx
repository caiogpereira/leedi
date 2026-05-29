'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { loginAction } from './actions';

interface LoginFormProps {
  // True when the user arrived from a successful password reset
  // (/login?reset=success) — AC#2 success message.
  resetSuccess?: boolean;
}

export function LoginForm({ resetSuccess }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const [state, action, isPending] = useActionState(loginAction, {});

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-lg border p-8">
        <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
        <form action={action} className="space-y-4">
          {resetSuccess && !state.error && (
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
              {t('resetSuccessMessage')}
            </div>
          )}
          {state.error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {state.error}
            </div>
          )}
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
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              {t('passwordLabel')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              id="rememberMe"
              name="rememberMe"
              type="checkbox"
              defaultChecked
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {t('rememberMe')}
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? '...' : t('submitButton')}
          </button>
          <div className="flex items-center justify-between text-sm text-gray-600">
            <Link href="/forgot-password" className="text-indigo-600 hover:underline">
              {t('forgotPassword')}
            </Link>
            <Link href="/register" className="text-indigo-600 hover:underline">
              {t('registerLink')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
