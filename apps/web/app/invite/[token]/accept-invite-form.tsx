'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { acceptInviteAction, type AcceptInviteState } from './actions';

interface AcceptInviteFormProps {
  token: string;
  /** New users must set a password; existing accounts just accept. */
  isNewUser: boolean;
}

export function AcceptInviteForm({ token, isNewUser }: AcceptInviteFormProps) {
  const t = useTranslations('invite');
  // Bind the token (from the URL) so the action never trusts it from the form body.
  const boundAction = acceptInviteAction.bind(null, token);
  const [state, action, isPending] = useActionState<AcceptInviteState, FormData>(boundAction, {});

  return (
    <div className="w-full max-w-md rounded-lg border p-8">
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <form action={action} className="space-y-4">
        {state.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
        )}
        {isNewUser && (
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              {t('passwordLabel')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
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
