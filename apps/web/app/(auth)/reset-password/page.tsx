import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ResetPasswordForm } from './reset-password-form';

interface ResetPasswordPageProps {
  // Next 15: searchParams is async. Better-Auth's reset callback lands here with
  // `?token=VALID_TOKEN` (valid) or `?error=INVALID_TOKEN` (expired/invalid).
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const t = await getTranslations('auth.resetPassword');
  const { token, error } = await searchParams;

  // Primary AC#3 path: an already-expired or invalid link is caught by
  // Better-Auth's GET callback before reaching this page; it redirects here with
  // ?error=INVALID_TOKEN. A missing token (link tampered/incomplete) is treated
  // the same way.
  if (error || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md rounded-lg border p-8 text-center">
          <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
          <p className="text-red-700">{t('expiredMessage')}</p>
          <p className="mt-6 text-sm text-gray-600">
            <Link href="/forgot-password" className="text-indigo-600 hover:underline">
              {t('requestNewLink')}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <ResetPasswordForm token={token} />
    </div>
  );
}
