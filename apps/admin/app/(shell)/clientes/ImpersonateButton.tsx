'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ImpersonateButtonProps {
  tenantId: string;
  tenantName: string;
  /**
   * Where to land the admin after impersonation starts. The tenant dashboard
   * lives on a different origin/port; cookies set by the API route are visible
   * there because cookies ignore the port.
   */
  dashboardUrl: string;
}

/**
 * Starts impersonation for a single tenant (Story 2.8 AC#1, reused by Story 20.2
 * AC#3). Moved here from the now-redirected `/tenants` page.
 *
 * Confirms, POSTs to /api/admin/impersonate (which re-verifies super_admin
 * server-side, writes the impersonate_start audit log, and sets the
 * impersonation + active-tenant cookies), then navigates to the tenant dashboard.
 */
export function ImpersonateButton({ tenantId, tenantName, dashboardUrl }: ImpersonateButtonProps) {
  const t = useTranslations('clientes');
  const [isStarting, setIsStarting] = useState(false);

  async function handleImpersonate() {
    if (!window.confirm(t('impersonateConfirm', { name: tenantName }))) {
      return;
    }
    setIsStarting(true);
    try {
      const response = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (!response.ok) {
        window.alert(t('impersonateError'));
        return;
      }
      window.location.assign(dashboardUrl);
    } catch {
      window.alert(t('impersonateError'));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleImpersonate}
      disabled={isStarting}
      className="rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
    >
      {isStarting ? t('impersonating') : t('impersonate')}
    </button>
  );
}
