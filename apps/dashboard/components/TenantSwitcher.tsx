'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { UserTenant } from '@leedi/tenancy';

interface TenantSwitcherProps {
  tenants: UserTenant[];
  currentTenantId: string | null;
}

/**
 * Header tenant switcher (Story 2.7).
 *
 * AC: hidden entirely for single-tenant users; lists each tenant with the user's
 * role in it; selecting one POSTs to /api/tenant/switch (which re-verifies the
 * membership server-side and sets the `leedi_tenant` cookie), then forces a full
 * server re-render so every Server Component re-fetches under the new tenant.
 */
export function TenantSwitcher({ tenants, currentTenantId }: TenantSwitcherProps) {
  const t = useTranslations('tenantSwitcher');
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const router = useRouter();

  // Hide the switcher for single-tenant users (AC: switcher hidden).
  if (tenants.length <= 1) {
    return null;
  }

  const currentTenant = tenants.find((tenant) => tenant.tenantId === currentTenantId) ?? tenants[0];

  async function handleSwitch(tenantId: string) {
    if (tenantId === currentTenantId) {
      setIsOpen(false);
      return;
    }
    setIsSwitching(true);
    try {
      const response = await fetch('/api/tenant/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      if (!response.ok) {
        return;
      }
      // Full server re-render so Server Components re-fetch with the new tenant.
      router.refresh();
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={isSwitching}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        <span>{isSwitching ? t('switching') : (currentTenant?.name ?? t('label'))}</span>
        <span aria-hidden className="text-xs text-gray-500">
          ▼
        </span>
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border bg-white shadow-lg"
        >
          {tenants.map((tenant) => (
            <li key={tenant.tenantId}>
              <button
                type="button"
                role="option"
                aria-selected={tenant.tenantId === currentTenant?.tenantId}
                onClick={() => handleSwitch(tenant.tenantId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-gray-50"
              >
                <span>{tenant.name}</span>
                <span className="text-xs text-gray-400">{t(`roles.${tenant.role}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
