import { getTranslations } from 'next-intl/server';
import { getInvitation } from '@leedi/tenancy';
import { AcceptInviteForm } from './accept-invite-form';

interface InvitePageProps {
  // Next 15: params is async.
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const t = await getTranslations('invite');
  const { token } = await params;

  // Re-validate the token server-side at page load: expired / used / unknown links
  // render a dead-end message (the same token is RE-checked again on accept).
  const result = await getInvitation(token);

  if (!result.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-md rounded-lg border p-8 text-center">
          <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>
          <p className="text-red-700">
            {result.expired ? t('expiredMessage') : t('invalidMessage')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <AcceptInviteForm token={token} isNewUser={result.invitation.isNewUser} />
    </div>
  );
}
