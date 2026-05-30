'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface ImpersonationBannerProps {
  tenantName: string;
}

/**
 * Persistent support-mode banner (Story 2.8 AC#1).
 *
 * Rendered by the dashboard layout ONLY when impersonation is active AND the
 * caller has been server-verified as a super_admin (the layout does that check —
 * this component is purely presentational). The banner is unmissable and always
 * visible so the admin knows every action is being recorded.
 *
 * "Sair do modo suporte" POSTs to /api/admin/stop-impersonation, which logs
 * `impersonate_end` and clears the impersonation + active-tenant cookies, then
 * forces a full server re-render so the layout drops the banner and the tenant
 * scope (AC#3).
 */
export function ImpersonationBanner({ tenantName }: ImpersonationBannerProps) {
  const t = useTranslations('impersonation');
  const [isExiting, setIsExiting] = useState(false);
  const router = useRouter();

  async function handleExit() {
    setIsExiting(true);
    try {
      await fetch('/api/admin/stop-impersonation', { method: 'POST' });
      router.push('/');
      router.refresh();
    } finally {
      setIsExiting(false);
    }
  }

  return (
    <div className="flex items-center justify-between bg-orange-500 px-6 py-2 text-sm text-white">
      <span>{t('banner', { tenantName })}</span>
      <button
        type="button"
        onClick={handleExit}
        disabled={isExiting}
        className="rounded bg-white px-3 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 disabled:opacity-50"
      >
        {isExiting ? t('exiting') : t('exit')}
      </button>
    </div>
  );
}
