'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ImpersonationBannerProps {
  tenantName: string;
  /** Super-admin app origin to return to on exit (the dashboard root would show
   *  "Nenhum workspace" since the impersonating super_admin has no membership). */
  adminUrl: string;
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
 * navigates back to the super-admin app (AC#3). It must NOT land on the dashboard
 * root: the real super_admin has no membership there, so they'd hit the
 * "Nenhum workspace" empty state instead of their admin context.
 */
export function ImpersonationBanner({ tenantName, adminUrl }: ImpersonationBannerProps) {
  const t = useTranslations('impersonation');
  const [isExiting, setIsExiting] = useState(false);

  async function handleExit() {
    setIsExiting(true);
    try {
      // Await the POST so the cookie-clearing Set-Cookie headers are applied
      // before we leave; then a full cross-origin navigation to the admin app.
      await fetch('/api/admin/stop-impersonation', { method: 'POST' });
      window.location.assign(adminUrl);
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
